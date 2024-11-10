package controllers

import org.apache.pekko.stream.scaladsl.StreamConverters
import com.google.common.net.HttpHeaders
import com.gu.mediaservice.{GridClient, JsonDiff}
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model.{Action, _}
import com.gu.mediaservice.lib.auth.Authentication.{Request, _}
import com.gu.mediaservice.lib.auth.Permissions.{ArchiveImages, DeleteCropsOrUsages, EditMetadata, UploadImages, DeleteImage => DeleteImagePermission}
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.aws.{ContentDisposition, ThrallMessageSender, UpdateMessage}
import com.gu.mediaservice.lib.config.InstanceForRequest
import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.lib.metadata.SoftDeletedMetadataTable
import com.gu.mediaservice.model._
import com.gu.mediaservice.syntax.MessageSubjects
import lib._
import lib.elasticsearch._
import org.apache.http.entity.ContentType
import org.http4s.UriTemplate
import org.joda.time.{DateTime, DateTimeZone}
import play.api.http.HttpEntity
import play.api.libs.json._
import play.api.libs.ws.WSClient
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._

import java.net.URI
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class MediaApi(
                auth: Authentication,
                messageSender: ThrallMessageSender,
                softDeletedMetadataTable: SoftDeletedMetadataTable,
                elasticSearch: ElasticSearch,
                imageResponse: ImageResponse,
                config: MediaApiConfig,
                override val controllerComponents: ControllerComponents,
                s3Client: S3Client,
                mediaApiMetrics: MediaApiMetrics,
                ws: WSClient,
                authorisation: Authorisation
)(implicit val ec: ExecutionContext) extends BaseController with MessageSubjects with ArgoHelpers with ContentDisposition with InstanceForRequest {

  private val gridClient: GridClient = GridClient(config.services)(ws)

  private val searchParamList = List(
    "q",
    "ids",
    "offset",
    "length",
    "orderBy",
    "since",
    "until",
    "modifiedSince",
    "modifiedUntil",
    "takenSince",
    "takenUntil",
    "uploadedBy",
    "archived",
    "valid",
    "free",
    "payType",
    "hasExports",
    "hasIdentifier",
    "missingIdentifier",
    "hasMetadata",
    "persisted",
    "usageStatus",
    "usagePlatform",
    "hasRightsAcquired",
    "syndicationStatus",
    "countAll",
    "persisted"
  ).mkString(",")

  private val searchLinkHref = s"${config.rootUri}/images{?$searchParamList}"

  private val searchLink = Link("search", searchLinkHref)


  private def indexResponse(user: Principal) = {
    val indexData = Json.obj(
      "description" -> "This is the Media API"
      // ^ Flatten None away
    )

    val userCanUpload: Boolean = authorisation.hasPermissionTo(UploadImages)(user)
    val userCanArchive: Boolean = authorisation.hasPermissionTo(ArchiveImages)(user)

    val maybeLoaderLink: Option[Link] = Some(Link("loader", config.loaderUri)).filter(_ => userCanUpload)
    val maybeArchiveLink: Option[Link] = Some(Link("archive", s"${config.metadataUri}/metadata/{id}/archived")).filter(_ => userCanArchive)
    val indexLinks = List(
      searchLink,
      Link("image",           s"${config.rootUri}/images/{id}"),
      // FIXME: credit is the only field available for now as it's the only on
      // that we are indexing as a completion suggestion
      Link("metadata-search", s"${config.rootUri}/suggest/metadata/{field}{?q}"),
      Link("label-search",    s"${config.rootUri}/images/edits/label{?q}"),
      Link("cropper",         config.cropperUri),
      Link("edits",           config.metadataUri),
      Link("session",         s"${config.authUri}/session"),
      Link("witness-report",  s"${config.services.guardianWitnessBaseUri}/2/report/{id}"),
      Link("collections",     config.collectionsUri),
      Link("permissions",     s"${config.rootUri}/permissions"),
      Link("leases",          config.leasesUri),
      Link("syndicate-image", s"${config.rootUri}/images/{id}/{partnerName}/{startPending}/syndicateImage"),
      Link("undelete",        s"${config.rootUri}/images/{id}/undelete")
    ) ++ maybeLoaderLink.toList ++ maybeArchiveLink.toList
    respond(indexData, indexLinks)
  }

  private def ImageCannotBeDeleted = respondError(MethodNotAllowed, "cannot-delete", "Cannot delete persisted images")
  private def ImageDeleteForbidden = respondError(Forbidden, "delete-not-allowed", "No permission to delete this image")
  private def ImageEditForbidden = respondError(Forbidden, "edit-not-allowed", "No permission to edit this image")
  private def ImageNotFound(id: String) = respondError(NotFound, "image-not-found", s"No image found with the given id $id")
  private def ExportNotFound = respondError(NotFound, "export-not-found", "No export found with the given id")

  def index = auth { request => indexResponse(request.user) }

  def getIncludedFromParams(request: AuthenticatedRequest[AnyContent, Principal]): List[String] = {
    val includedQuery: Option[String] = request.getQueryString("include")

    includedQuery.map(_.split(",").map(_.trim).toList).getOrElse(List())
  }

  def canUserDeleteCropsOrUsages(principal: Principal): Boolean =
    authorisation.hasPermissionTo(DeleteCropsOrUsages)(principal)

  private def isAvailableForSyndication(image: Image): Boolean = image.syndicationRights.exists(_.isAvailableForSyndication)

  private def hasPermission(principal: Principal, image: Image): Boolean = principal.accessor.tier match {
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

  def uploadedBy(id: String) = auth.async { request =>
    implicit val r: Request[AnyContent] = request
    elasticSearch.getImageUploaderById(id) map {
      case Some(uploadedBy) =>
        respond(uploadedBy)
      case _ => ImageNotFound(id)
    }
  }

  def diffProjection(id: String) = auth.async { request =>
    val onBehalfOfFn: OnBehalfOfPrincipal = auth.getOnBehalfOfPrincipal(request.user)
    for {
      maybeEsImage <- getImageResponseFromES(id, request)
      maybeEsJson = maybeEsImage.map{ case (source, _, _, _) => Json.toJson(source) }
      maybeProjectedImage <- gridClient.getImageLoaderProjection(id, onBehalfOfFn)
      maybeProjectedJson = maybeProjectedImage.map(Json.toJson(_))
    } yield {
      (maybeEsJson, maybeProjectedJson) match {
        case (None, None) => ImageNotFound(id)
        case (es, projected) => respond(JsonDiff.diff(
          es.getOrElse(JsObject.empty),
          projected.getOrElse(JsObject.empty)
        ))
      }
    }
  }

  def getImageFileMetadata(id: String) = auth.async { request =>
    implicit val r: Request[AnyContent] = request

    elasticSearch.getImageById(id) map {
      case Some(image) if hasPermission(request.user, image) =>
        val links = List(
          Link("image", s"${config.rootUri}/images/$id")
        )
        respond(Json.toJson(image.fileMetadata), links)
      case _ => ImageNotFound(id)
    }
  }

  def getImageExports(id: String) = auth.async { request =>
    implicit val r: Request[AnyContent] = request

    elasticSearch.getImageById(id) map {
      case Some(image) if hasPermission(request.user, image) =>
        val links = List(
          Link("image", s"${config.rootUri}/images/$id")
        )
        respond(Json.toJson(image.exports), links)
      case _ => ImageNotFound(id)
    }
  }

  def getImageExport(imageId: String, exportId: String) = auth.async { request =>
    implicit val r: Request[AnyContent] = request

    elasticSearch.getImageById(imageId) map {
      case Some(source) if hasPermission(request.user, source) =>
        val exportOption = source.exports.find(_.id.contains(exportId))
        exportOption.foldLeft(ExportNotFound)((memo, export) => respond(export))
      case _ => ImageNotFound(imageId)
    }

  }

  def getSoftDeletedMetadata(id: String) = auth.async {
    softDeletedMetadataTable.getStatus(id)
      .map {
        case Some(scala.Right(record)) => respond(record)
        case Some(Left(error)) => respondError(BadRequest, "cannot-get", s"Cannot get soft-deleted metadata ${error}")
        case None => respondNotFound(s"No soft-deleted metadata found for image id: ${id}")
      }
      .recover{ case error => respondError(InternalServerError, "cannot-get", s"Cannot get soft-deleted metadata ${error}") }
  }

  def downloadImageExport(imageId: String, exportId: String, width: Int) = auth.async { request =>
    implicit val r: Request[AnyContent] = request

    elasticSearch.getImageById(imageId) map {
      case Some(source) if hasPermission(request.user, source) =>
        val maybeResult = for {
          export <- source.exports.find(_.id.contains(exportId))
          asset <- export.assets.find(_.dimensions.exists(_.width == width))
          s3Object <- Try(s3Client.getObject(config.imgPublishingBucket, asset.file)).toOption
          file = StreamConverters.fromInputStream(() => s3Object.getObjectContent)
          entity = HttpEntity.Streamed(file, asset.size, asset.mimeType.map(_.name))
          result = Result(ResponseHeader(OK), entity).withHeaders("Content-Disposition" -> getContentDisposition(source, export, asset, config.shortenDownloadFilename))
        } yield {
          if(config.recordDownloadAsUsage) {
            postToUsages(config.usageUri + "/usages/download", auth.getOnBehalfOfPrincipal(request.user), source.id, Authentication.getIdentity(request.user))
          }
          result
        }
        maybeResult.getOrElse(ExportNotFound)
      case _ => ImageNotFound(imageId)
    }
  }

  def hardDeleteImage(id: String) = auth.async { request =>
    implicit val r: Request[AnyContent] = request

    elasticSearch.getImageById(id) map {
      case Some(image) if hasPermission(request.user, image) =>
        val imageCanBeDeleted = imageResponse.canBeDeleted(image)

        if (imageCanBeDeleted) {
          val canDelete = authorisation.isUploaderOrHasPermission(request.user, image.uploadedBy, DeleteImagePermission)

          if (canDelete) {
            val updateMessage = UpdateMessage(subject = DeleteImage, id = Some(id))
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

  def deleteImage(id: String) = auth.async { request =>
    implicit val r: Request[AnyContent] = request

    elasticSearch.getImageById(id) map {
      case Some(image) if hasPermission(request.user, image) =>
        val imageCanBeDeleted = imageResponse.canBeDeleted(image)
        if (imageCanBeDeleted){
          val canDelete = authorisation.isUploaderOrHasPermission(request.user, image.uploadedBy, DeleteImagePermission)
          if(canDelete){
            val imageStatusRecord = ImageStatusRecord(id, request.user.accessor.identity, DateTime.now(DateTimeZone.UTC).toString, true)
            softDeletedMetadataTable.setStatus(imageStatusRecord)
            .map { _ =>
              messageSender.publish(
                UpdateMessage(
                  subject = SoftDeleteImage,
                  id = Some(id),
                  softDeletedMetadata = Some(SoftDeletedMetadata(
                    deleteTime = DateTime.now(DateTimeZone.UTC),
                    deletedBy = request.user.accessor.identity
                  ))
                )
              )
            }
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

  def unSoftDeleteImage(id: String) = auth.async { request =>
    implicit val r: Request[AnyContent] = request
    elasticSearch.getImageById(id) map {
      case Some(image) if hasPermission(request.user, image) =>
        val canDelete = authorisation.isUploaderOrHasPermission(request.user, image.uploadedBy, DeleteImagePermission)
        if(canDelete){
          softDeletedMetadataTable.updateStatus(id, false)
          .map { _ =>
            messageSender.publish(
              UpdateMessage(
                subject = UnSoftDeleteImage,
                id = Some(id)
              )
             )
          }
          Accepted
        } else {
          ImageDeleteForbidden
        }
      case _ => ImageNotFound(id)
    }
  }

  def downloadOriginalImage(id: String) = auth.async { request =>
    implicit val r: Request[AnyContent] = request

    elasticSearch.getImageById(id) flatMap {
      case Some(image) if hasPermission(request.user, image) => {
        val apiKey = request.user.accessor
        logger.info(s"Download original image: $id from user: ${Authentication.getIdentity(request.user)}", apiKey, id)
        mediaApiMetrics.incrementImageDownload(apiKey, mediaApiMetrics.OriginalDownloadType)
        val s3Object = s3Client.getObject(config.imageBucket, image.source.file)
        val file = StreamConverters.fromInputStream(() => s3Object.getObjectContent)
        val entity = HttpEntity.Streamed(file, image.source.size, image.source.mimeType.map(_.name))

        if(config.recordDownloadAsUsage) {
          postToUsages(config.usageUri + "/usages/download", auth.getOnBehalfOfPrincipal(request.user), id, Authentication.getIdentity(request.user))
        }

          Future.successful(
            Result(ResponseHeader(OK), entity).withHeaders("Content-Disposition" -> getContentDisposition(image, Source, config.shortenDownloadFilename))
          )
      }
      case _ => Future.successful(ImageNotFound(id))
    }
  }

  def syndicateImage(id: String, partnerName: String, startPending: String) = auth.async { request =>
    implicit val r: Request[AnyContent] = request

    elasticSearch.getImageById(id) flatMap {
      case Some(image) if hasPermission(request.user, image) => {
        val apiKey = request.user.accessor
        logger.info(s"Syndicate image: $id from user: ${Authentication.getIdentity(request.user)}", apiKey,
          id, partnerName, startPending)

        postToUsages(config.usageUri + "/usages/syndication", auth.getOnBehalfOfPrincipal(request.user), id,
          Authentication.getIdentity(request.user), Option(partnerName), Option(startPending))

        Future.successful(Ok)
      }
      case _ => {
        Future.successful(ImageNotFound(id))}
    }
  }

  def downloadOptimisedImage(id: String, width: Integer, height: Integer, quality: Integer) = auth.async { request =>
    implicit val r: Request[AnyContent] = request

    elasticSearch.getImageById(id) flatMap {
      case Some(image) if hasPermission(request.user, image) => {
        val apiKey = request.user.accessor
        logger.info(s"Download optimised image: $id from user: ${Authentication.getIdentity(request.user)}", apiKey, id)
        mediaApiMetrics.incrementImageDownload(apiKey, mediaApiMetrics.OptimisedDownloadType)

        val sourceImageUri =
          new URI(s3Client.signUrl(config.imageBucket, image.optimisedPng.getOrElse(image.source).file, image, imageType = image.optimisedPng match {
            case Some(_) => OptimisedPng
            case _ => Source
          }))

        if(config.recordDownloadAsUsage) {
          postToUsages(config.usageUri + "/usages/download", auth.getOnBehalfOfPrincipal(request.user), id, Authentication.getIdentity(request.user))
        }

        Future.successful(
          Redirect(config.imgopsUri + List(sourceImageUri.getPath, sourceImageUri.getRawQuery).mkString("?") + s"&w=$width&h=$height&q=$quality")
        )
      }
      case _ => Future.successful(ImageNotFound(id))
    }
  }

  def postToUsages(uri: String, onBehalfOfPrincipal: Authentication.OnBehalfOfPrincipal, mediaId: String, user: String,
                   partnerName: Option[String] = None, startPending: Option[String] = None)(implicit r: Request[AnyContent]) = {

    val baseRequest = ws.url(uri)
      .withHttpHeaders(Authentication.originalServiceHeaderName -> config.appName,
        HttpHeaders.ORIGIN -> config.rootUri(instanceOf(r)),
        HttpHeaders.CONTENT_TYPE -> ContentType.APPLICATION_JSON.getMimeType)

    val request = onBehalfOfPrincipal(baseRequest)

    val usagesMetadata = uri match {
      case s if s.contains("download") =>  Map("mediaId" -> mediaId,
        "dateAdded" -> printDateTime(DateTime.now()),
        "downloadedBy" -> user)
      case s if s.contains("syndication") => Map("mediaId" -> mediaId,
        "dateAdded" -> printDateTime(DateTime.now()),
        "syndicatedBy" -> user,
        "startPending" -> startPending.getOrElse("false"),
        "partnerName" -> partnerName.getOrElse(
          throw new IllegalArgumentException("partnerName required for SyndicationUsageRequest"))
      )
    }
    logger.info(s"Making usages request to $uri")
    request.post(Json.toJson(Map("data" -> usagesMetadata))) //fire and forget
  }

  def imageSearch() = auth.async { request =>
    implicit val r: Request[AnyContent] = request

    val shouldFlagGraphicImages = request.cookies.get("SHOULD_BLUR_GRAPHIC_IMAGES")
      .map(_.value).getOrElse(config.defaultShouldBlurGraphicImages.toString) == "true"

    implicit val logMarker: MarkerMap = MarkerMap(
      "shouldFlagGraphicImages" -> shouldFlagGraphicImages,
      "user" -> r.user.accessor.identity
    )

    val include = getIncludedFromParams(request)

    def hitToImageEntity(elasticId: String, image: SourceWrapper[Image]): EmbeddedEntity[JsValue] = {
      val writePermission = authorisation.isUploaderOrHasPermission(request.user, image.instance.uploadedBy, EditMetadata)
      val deletePermission = authorisation.isUploaderOrHasPermission(request.user, image.instance.uploadedBy, DeleteImagePermission)
      val deleteCropsOrUsagePermission = canUserDeleteCropsOrUsages(request.user)

      val (imageData, imageLinks, imageActions) =
        imageResponse.create(elasticId, image, writePermission, deletePermission, deleteCropsOrUsagePermission, include, request.user.accessor.tier)
      val id = (imageData \ "id").as[String]
      val imageUri = URI.create(s"${config.rootUri}/images/$id")
      EmbeddedEntity(uri = imageUri, data = Some(imageData), imageLinks, imageActions)
    }

    def respondSuccess(searchParams: SearchParams) = for {
      SearchResults(hits, totalCount, maybeOrgOwnedCount) <- elasticSearch.search(
        searchParams.copy(
          shouldFlagGraphicImages = shouldFlagGraphicImages,
        )
      )
      imageEntities = hits map (hitToImageEntity _).tupled
      prevLink = getPrevLink(searchParams)
      nextLink = getNextLink(searchParams, totalCount)
      links = List(prevLink, nextLink).flatten
    } yield respondCollection(imageEntities, Some(searchParams.offset), Some(totalCount), maybeOrgOwnedCount, links)

    val _searchParams = SearchParams(request)
    val hasDeletePermission = authorisation.isUploaderOrHasPermission(request.user, "", DeleteImagePermission)
    val canViewDeletedImages = _searchParams.query.contains("is:deleted") && !hasDeletePermission
    val searchParams = if(canViewDeletedImages) _searchParams.copy(uploadedBy = Some(Authentication.getIdentity(request.user))) else _searchParams

    SearchParams.validate(searchParams).fold(
      // TODO: respondErrorCollection?
      errors => Future.successful(respondError(UnprocessableEntity, InvalidUriParams.errorKey,
        errors.map(_.message).mkString(", "))
      ),
      params => respondSuccess(params)
    )
  }

  private def getImageResponseFromES(id: String, request: Authentication.Request[AnyContent]): Future[Option[(Image, JsValue, List[Link], List[Action])]] = {
    implicit val r: Authentication.Request[AnyContent] = request

    val include = getIncludedFromParams(request)

    elasticSearch.getImageWithSourceById(id) map {
      case Some(source) if hasPermission(request.user, source.instance) =>
        val writePermission = authorisation.isUploaderOrHasPermission(request.user, source.instance.uploadedBy, EditMetadata)
        val deleteImagePermission = authorisation.isUploaderOrHasPermission(request.user, source.instance.uploadedBy, DeleteImagePermission)
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

        Some((source.instance, imageData, imageLinks, imageActions))

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
