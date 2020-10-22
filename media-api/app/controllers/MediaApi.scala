package controllers

import java.net.URI

import akka.stream.scaladsl.StreamConverters
import com.google.common.net.HttpHeaders
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model.{Action, _}
import com.gu.mediaservice.lib.auth.Authentication.{ApiKeyAccessor, OnBehalfOfApiKey, OnBehalfOfUser, PandaUser, Principal}
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.aws.{ThrallMessageSender, UpdateMessage}
import com.gu.mediaservice.lib.cleanup.{MetadataCleaners, SupplierProcessors}
import com.gu.mediaservice.lib.config.{MetadataStore, UsageRightsStore}
import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.lib.metadata.ImageMetadataConverter
import com.gu.mediaservice.model._
import com.gu.permissions.PermissionDefinition
import lib._
import lib.elasticsearch._
import org.apache.http.entity.ContentType
import org.http4s.UriTemplate
import org.joda.time.DateTime
import play.api.http.HttpEntity
import play.api.libs.json._
import play.api.libs.ws.WSClient
import play.api.mvc.{AnyContent, BaseController, ControllerComponents}
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc.{Result, ResponseHeader}

import scala.concurrent.{ExecutionContext, Future}

class MediaApi(
                auth: Authentication,
                messageSender: ThrallMessageSender,
                elasticSearch: ElasticSearch,
                imageResponse: ImageResponse,
                override val config: MediaApiConfig,
                override val controllerComponents: ControllerComponents,
                s3Client: S3Client,
                mediaApiMetrics: MediaApiMetrics,
                ws: WSClient,
                metadataStore: MetadataStore,
                usageRightsStore: UsageRightsStore
)(implicit val ec: ExecutionContext) extends BaseController with ArgoHelpers with PermissionsHandler {

  private val searchParamList = List("q", "ids", "offset", "length", "orderBy",
    "since", "until", "modifiedSince", "modifiedUntil", "takenSince", "takenUntil",
    "uploadedBy", "archived", "valid", "free", "payType",
    "hasExports", "hasIdentifier", "missingIdentifier", "hasMetadata",
    "persisted", "usageStatus", "usagePlatform", "hasRightsAcquired", "syndicationStatus").mkString(",")

  private val searchLinkHref = s"${config.rootUri}/images{?$searchParamList}"

  private val searchLink = Link("search", searchLinkHref)

  private val indexResponse = {
    val indexData = Json.obj(
      "description" -> "This is the Media API"
      // ^ Flatten None away
    )
    val indexLinks = List(
      searchLink,
      Link("image",           s"${config.rootUri}/images/{id}"),
      // FIXME: credit is the only field available for now as it's the only on
      // that we are indexing as a completion suggestion
      Link("metadata-search", s"${config.rootUri}/suggest/metadata/{field}{?q}"),
      Link("label-search",    s"${config.rootUri}/images/edits/label{?q}"),
      Link("cropper",         config.cropperUri),
      Link("loader",          config.loaderUri),
      Link("edits",           config.metadataUri),
      Link("session",         s"${config.authUri}/session"),
      Link("witness-report",  s"${config.services.guardianWitnessBaseUri}/2/report/{id}"),
      Link("collections",     config.collectionsUri),
      Link("permissions",     s"${config.rootUri}/permissions"),
      Link("leases",          config.leasesUri),
      Link("admin-tools",     config.adminToolsUri)
    )
    respond(indexData, indexLinks)
  }

  private val ImageCannotBeDeleted = respondError(MethodNotAllowed, "cannot-delete", "Cannot delete persisted images")
  private val ImageDeleteForbidden = respondError(Forbidden, "delete-not-allowed", "No permission to delete this image")
  private val ImageEditForbidden = respondError(Forbidden, "edit-not-allowed", "No permission to edit this image")
  private def ImageNotFound(id: String) = respondError(NotFound, "image-not-found", s"No image found with the given id $id")
  private val ExportNotFound = respondError(NotFound, "export-not-found", "No export found with the given id")

  def index = auth { indexResponse }

  def getIncludedFromParams(request: AuthenticatedRequest[AnyContent, Principal]): List[String] = {
    val includedQuery: Option[String] = request.getQueryString("include")

    includedQuery.map(_.split(",").map(_.trim).toList).getOrElse(List())
  }

  private def isUploaderOrHasPermission(
    request: AuthenticatedRequest[AnyContent, Principal],
    image: Image,
    permission: PermissionDefinition
  ) = {
    request.user match {
      case user: PandaUser =>
        if (user.user.email.toLowerCase == image.uploadedBy.toLowerCase) {
          true
        } else {
          hasPermission(user, permission)
        }
      case service: ApiKeyAccessor if service.accessor.tier == Internal => true
      case _ => false
    }
  }

  def canUserWriteMetadata(request: AuthenticatedRequest[AnyContent, Principal], image: Image): Boolean = {
    isUploaderOrHasPermission(request, image, Permissions.EditMetadata)
  }

  def canUserDeleteImage(request: AuthenticatedRequest[AnyContent, Principal], image: Image): Boolean = {
    isUploaderOrHasPermission(request, image, Permissions.DeleteImage)
  }

  def canUserDeleteCropsOrUsages(user: Principal): Boolean = hasPermission(user, Permissions.DeleteCrops)

  private def isAvailableForSyndication(image: Image): Boolean = image.syndicationRights.exists(_.isAvailableForSyndication)

  private def hasPermission(request: Authentication.Request[Any], image: Image): Boolean = request.user.accessor.tier match {
    case Syndication => isAvailableForSyndication(image)
    case _ => true
  }

  def getImage(id: String) = auth.async { request =>
    getImageResponseFromES(id, request) map {
      case Some((_, imageData, imageLinks, imageActions)) =>
        respond(imageData, imageLinks, imageActions)
      case _ => ImageNotFound(id)
    }
  }

  /**
    * Get the raw response from ElasticSearch.
    */
  def getImageFromElasticSearch(id: String) = auth.async { request =>
    getImageResponseFromES(id, request) map {
      case Some((source, _, imageLinks, imageActions)) =>
        respond(source, imageLinks, imageActions)
      case _ => ImageNotFound(id)
    }
  }

  def getImageFileMetadata(id: String) = auth.async { request =>
    implicit val r = request

    elasticSearch.getImageById(id) map {
      case Some(image) if hasPermission(request, image) =>
        val links = List(
          Link("image", s"${config.rootUri}/images/$id")
        )
        respond(Json.toJson(image.fileMetadata), links)
      case _ => ImageNotFound(id)
    }
  }

  def getImageExports(id: String) = auth.async { request =>
    implicit val r = request

    elasticSearch.getImageById(id) map {
      case Some(image) if hasPermission(request, image) =>
        val links = List(
          Link("image", s"${config.rootUri}/images/$id")
        )
        respond(Json.toJson(image.exports), links)
      case _ => ImageNotFound(id)
    }
  }

  def getImageExport(imageId: String, exportId: String) = auth.async { request =>
    implicit val r = request

    elasticSearch.getImageById(imageId) map {
      case Some(source) if hasPermission(request, source) =>
        val exportOption = source.exports.find(_.id.contains(exportId))
        exportOption.foldLeft(ExportNotFound)((memo, export) => respond(export))
      case _ => ImageNotFound(imageId)
    }

  }

  def deleteImage(id: String) = auth.async { request =>
    implicit val r = request

    elasticSearch.getImageById(id) map {
      case Some(image) if hasPermission(request, image) =>
        val imageCanBeDeleted = imageResponse.canBeDeleted(image)

        if (imageCanBeDeleted) {
          val canDelete = canUserDeleteImage(request, image)

          if (canDelete) {
            val deleteImage = "delete-image"
            val updateMessage = UpdateMessage(subject = deleteImage, id = Some(id))
            messageSender.publish(updateMessage)
            Accepted
          } else {
            ImageDeleteForbidden
          }
        } else {
          ImageCannotBeDeleted
        }

      case _ => ImageNotFound(id)
    }
  }

  def downloadOriginalImage(id: String) = auth.async { request =>
    implicit val r = request

    elasticSearch.getImageById(id) flatMap {
      case Some(image) if hasPermission(request, image) => {
        val apiKey = request.user.accessor
        GridLogger.info(s"Download original image: $id from user: ${Authentication.getIdentity(request.user)}", apiKey, id)
        mediaApiMetrics.incrementImageDownload(apiKey, mediaApiMetrics.OriginalDownloadType)
        val s3Object = s3Client.getObject(config.imageBucket, image.source.file)
        val file = StreamConverters.fromInputStream(() => s3Object.getObjectContent)
        val entity = HttpEntity.Streamed(file, image.source.size, image.source.mimeType.map(_.name))

        if(config.recordDownloadAsUsage) {
          postToUsages(config.usageUri + "/usages/download", auth.getOnBehalfOfPrincipal(request.user, request), id, Authentication.getIdentity(request.user))
        }

        Future.successful(
          Result(ResponseHeader(OK), entity).withHeaders("Content-Disposition" -> s3Client.getContentDisposition(image, Source))
        )

      }
      case _ => Future.successful(ImageNotFound(id))
    }
  }

  def downloadOptimisedImage(id: String, width: Integer, height: Integer, quality: Integer) = auth.async { request =>
    implicit val r = request

    elasticSearch.getImageById(id) flatMap {
      case Some(image) if hasPermission(request, image) => {
        val apiKey = request.user.accessor
        GridLogger.info(s"Download optimised image: $id from user: ${Authentication.getIdentity(request.user)}", apiKey, id)
        mediaApiMetrics.incrementImageDownload(apiKey, mediaApiMetrics.OptimisedDownloadType)

        val sourceImageUri =
          new URI(s3Client.signUrl(config.imageBucket, image.optimisedPng.getOrElse(image.source).file, image, imageType = image.optimisedPng match {
            case Some(_) => OptimisedPng
            case _ => Source
          }))

        postToUsages(config.usageUri + "/usages/download", auth.getOnBehalfOfPrincipal(request.user, request), id, Authentication.getIdentity(request.user))

        Future.successful(
          Redirect(config.imgopsUri + List(sourceImageUri.getPath, sourceImageUri.getRawQuery).mkString("?") + s"&w=$width&h=$height&q=$quality")
        )
      }
      case _ => Future.successful(ImageNotFound(id))
    }
  }


  def postToUsages(uri: String, onBehalfOfPrincipal: Authentication.OnBehalfOfPrincipal, mediaId: String, user: String) = {
    val baseRequest = ws.url(uri)
      .withHttpHeaders(Authentication.originalServiceHeaderName -> config.appName,
          HttpHeaders.ORIGIN -> config.rootUri,
          HttpHeaders.CONTENT_TYPE -> ContentType.APPLICATION_JSON.getMimeType)

    val request = onBehalfOfPrincipal match {
      case OnBehalfOfApiKey(apiKey) =>
        print(apiKey.accessor.identity)
        baseRequest.addHttpHeaders(Authentication.apiKeyHeaderName -> apiKey.accessor.identity)
      case OnBehalfOfUser(_, cookie) =>
        baseRequest.addCookies(cookie)
    }

    val usagesMetadata = Map("mediaId" -> mediaId,
        "dateAdded" -> printDateTime(DateTime.now()),
        "downloadedBy" -> user)

    GridLogger.info(s"Making usages download request")
    request.post(Json.toJson(Map("data" -> usagesMetadata))) //fire and forget
  }

  def reindexImage(id: String) = auth.async { request =>
    implicit val r = request

    val metadataConfig = metadataStore.get
    val metadataCleaners = new MetadataCleaners(metadataConfig.allPhotographers)

    elasticSearch.getImageById(id) map {
      case Some(image) if hasPermission(request, image) =>
        // TODO: apply rights to edits API too
        // TODO: helper to abstract boilerplate
        val canWrite = canUserWriteMetadata(request, image)
        if (canWrite) {
          val imageMetadata = ImageMetadataConverter.fromFileMetadata(image.fileMetadata)
          val cleanMetadata = metadataCleaners.clean(imageMetadata)
          val imageCleanMetadata = image.copy(metadata = cleanMetadata, originalMetadata = cleanMetadata)
          val usageRightsConfig = usageRightsStore.get
          val processedImage = new SupplierProcessors(metadataConfig).process(imageCleanMetadata, usageRightsConfig)

          // FIXME: dirty hack to sync the originalUsageRights and originalMetadata as well
          val finalImage = processedImage.copy(
            originalMetadata = processedImage.metadata,
            originalUsageRights = processedImage.usageRights
          )

          val updateImage = "update-image"
          val updateMessage = UpdateMessage(subject = updateImage, id = Some(finalImage.id), image = Some(finalImage))
          messageSender.publish(updateMessage)

          Ok(Json.obj(
            "id" -> id,
            "changed" -> JsBoolean(image != finalImage),
            "data" -> Json.obj(
              "oldImage" -> image,
              "updatedImage" -> finalImage
            )
          ))
        } else {
          ImageEditForbidden
        }
      case None => ImageNotFound(id)
    }
  }

  def imageSearch() = auth.async { request =>
    implicit val r = request

    val include = getIncludedFromParams(request)

    def hitToImageEntity(elasticId: String, image: Image): EmbeddedEntity[JsValue] = {
      val writePermission = canUserWriteMetadata(request, image)
      val deletePermission = canUserDeleteImage(request, image)
      val deleteCropsOrUsagePermission = canUserDeleteCropsOrUsages(request.user)

      val (imageData, imageLinks, imageActions) =
        imageResponse.create(elasticId, image, writePermission, deletePermission, deleteCropsOrUsagePermission, include, request.user.accessor.tier)
      val id = (imageData \ "id").as[String]
      val imageUri = URI.create(s"${config.rootUri}/images/$id")
      EmbeddedEntity(uri = imageUri, data = Some(imageData), imageLinks, imageActions)
    }

    def respondSuccess(searchParams: SearchParams) = for {
      SearchResults(hits, totalCount) <- elasticSearch.search(searchParams)
      imageEntities = hits map (hitToImageEntity _).tupled
      prevLink = getPrevLink(searchParams)
      nextLink = getNextLink(searchParams, totalCount)
      links = List(prevLink, nextLink).flatten
    } yield respondCollection(imageEntities, Some(searchParams.offset), Some(totalCount), links)

    val searchParams = SearchParams(request)

    SearchParams.validate(searchParams).fold(
      // TODO: respondErrorCollection?
      errors => Future.successful(respondError(UnprocessableEntity, InvalidUriParams.errorKey,
        // Annoyingly `NonEmptyList` and `IList` don't have `mkString`
        errors.map(_.message).list.reduce(_+ ", " +_), List(searchLink))
      ),
      params => respondSuccess(params)
    )
  }

  private def getImageResponseFromES(id: String, request: Authentication.Request[AnyContent]): Future[Option[(Image, JsValue, List[Link], List[Action])]] = {
    implicit val r: Authentication.Request[AnyContent] = request

    val include = getIncludedFromParams(request)

    elasticSearch.getImageById(id) map {
      case Some(source) if hasPermission(request, source) =>
        val writePermission = canUserWriteMetadata(request, source)
        val deleteImagePermission = canUserDeleteImage(request, source)
        val deleteCropsOrUsagePermission = canUserDeleteCropsOrUsages(request.user)

        val (imageData, imageLinks, imageActions) = imageResponse.create(
          id,
          source,
          writePermission,
          deleteImagePermission,
          deleteCropsOrUsagePermission,
          include,
          request.user.accessor.tier
        )

        Some((source, imageData, imageLinks, imageActions))

      case _ => None
    }
  }

  private def getSearchUrl(searchParams: SearchParams, updatedOffset: Int, length: Int): String = {
    // Enforce a toDate to exclude new images since the current request
    val toDate = searchParams.until.getOrElse(DateTime.now)

    val paramMap: Map[String, String] = SearchParams.toStringMap(searchParams) ++ Map(
      "offset" -> updatedOffset.toString,
      "length" -> length.toString,
      "toDate" -> printDateTime(toDate)
    )

    paramMap.foldLeft(UriTemplate()){ (acc, pair) => acc.expandAny(pair._1, pair._2)}.toString
  }

  private def getPrevLink(searchParams: SearchParams): Option[Link] = {
    val prevOffset = List(searchParams.offset - searchParams.length, 0).max
    if (searchParams.offset > 0) {
      // adapt length to avoid overlapping with current
      val prevLength = List(searchParams.length, searchParams.offset - prevOffset).min
      val prevUrl = getSearchUrl(searchParams, prevOffset, prevLength)
      Some(Link("prev", prevUrl))
    } else {
      None
    }
  }

  private def getNextLink(searchParams: SearchParams, totalCount: Long): Option[Link] = {
    val nextOffset = searchParams.offset + searchParams.length
    if (nextOffset < totalCount) {
      val nextUrl = getSearchUrl(searchParams, nextOffset, searchParams.length)
      Some(Link("next", nextUrl))
    } else {
      None
    }
  }

}
