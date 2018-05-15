package controllers

import java.net.URI

import com.gu.editorial.permissions.client.Permission
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.auth.Authentication.{AuthenticatedService, PandaUser, Principal}
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.cleanup.{MetadataCleaners, SupplierProcessors}
import com.gu.mediaservice.lib.config.MetadataConfig
import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.lib.metadata.ImageMetadataConverter
import com.gu.mediaservice.model._
import lib.elasticsearch._
import lib.{ImageResponse, MediaApiConfig, Notifications}
import org.http4s.UriTemplate
import org.joda.time.DateTime
import play.api.libs.json._
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

class MediaApi(auth: Authentication, notifications: Notifications, elasticSearch: ElasticSearch, imageResponse: ImageResponse,
               override val config: MediaApiConfig, override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers with PermissionsHandler {

  private val searchParamList = List("q", "ids", "offset", "length", "orderBy",
    "since", "until", "modifiedSince", "modifiedUntil", "takenSince", "takenUntil",
    "uploadedBy", "archived", "valid", "free", "payType",
    "hasExports", "hasIdentifier", "missingIdentifier", "hasMetadata",
    "persisted", "usageStatus", "usagePlatform").mkString(",")

  private val searchLinkHref = s"${config.rootUri}/images{?$searchParamList}"

  private val searchLink = Link("search", searchLinkHref)

  private val indexResponse = {
    val indexData = Json.obj(
      "description" -> "This is the Media API",
      "configuration" -> Map(
        "mixpanelToken" -> config.mixpanelToken
      ).collect { case (key, Some(value)) => key -> value }
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
      Link("witness-report",  s"https://n0ticeapis.com/2/report/{id}"),
      Link("collections",     config.collectionsUri),
      Link("permissions",     s"${config.rootUri}/permissions"),
      Link("leases",          config.leasesUri)
    )
    respond(indexData, indexLinks)
  }

  private val ImageCannotBeDeleted = respondError(MethodNotAllowed, "cannot-delete", "Cannot delete persisted images")
  private val ImageDeleteForbidden = respondError(Forbidden, "delete-not-allowed", "No permission to delete this image")
  private val ImageEditForbidden = respondError(Forbidden, "edit-not-allowed", "No permission to edit this image")
  private val ImageNotFound = respondError(NotFound, "image-not-found", "No image found with the given id")
  private val ExportNotFound = respondError(NotFound, "export-not-found", "No export found with the given id")

  def index = auth { indexResponse }

  def getIncludedFromParams(request: AuthenticatedRequest[AnyContent, Principal]): List[String] = {
    val includedQuery: Option[String] = request.getQueryString("include")

    includedQuery.map(_.split(",").map(_.trim).toList).getOrElse(List())
  }

  private def isUploaderOrHasPermission(
    request: AuthenticatedRequest[AnyContent, Principal],
    source: JsValue,
    permission: Permission
  ) = {
    request.user match {
      case user: PandaUser =>
        (source \ "uploadedBy").asOpt[String] match {
          case Some(uploader) if user.user.email.toLowerCase == uploader.toLowerCase => Future.successful(true)
          case _ => hasPermission(user, permission)
        }
      case _: AuthenticatedService => Future.successful(true)
      case _ => Future.successful(false)
    }
  }

  def canUserWriteMetadata(request: AuthenticatedRequest[AnyContent, Principal], source: JsValue) = {
    isUploaderOrHasPermission(request, source, Permissions.EditMetadata)
  }

  def canUserDeleteImage(request: AuthenticatedRequest[AnyContent, Principal], source: JsValue) = {
    isUploaderOrHasPermission(request, source, Permissions.DeleteImage)
  }

  private def hasStaffPhotographer(json: JsValue): Boolean = (json \ "usageRights" \ "category").validate[String].asOpt.contains(StaffPhotographer.category)

  private def hasPermission(request: Authentication.Request[Any], json: JsValue): Boolean = request.user.apiKey.tier match {
    case External if !hasStaffPhotographer(json) => false
    case _ => true
  }

  def getImage(id: String) = auth.async { request =>
    val include = getIncludedFromParams(request)

    elasticSearch.getImageById(id) flatMap {
      case Some(source) if hasPermission(request, source) =>
        val withWritePermission = canUserWriteMetadata(request, source)
        val withDeletePermission = canUserDeleteImage(request, source)

        Future.sequence(List(withWritePermission, withDeletePermission)).map {
          case List(writePermission, deletePermission) =>
            val (imageData, imageLinks, imageActions) =
              imageResponse.create(id, source, writePermission, deletePermission, include)
            respond(imageData, imageLinks, imageActions)
        }
      case _ => Future.successful(ImageNotFound)
    }
  }

  def getImageFileMetadata(id: String) = auth.async { request =>
    elasticSearch.getImageById(id) map {
      case Some(source) if hasPermission(request, source) =>
        val links = List(
          Link("image", s"${config.rootUri}/images/$id")
        )
        respond((source \ "fileMetadata").getOrElse(JsNull), links)
      case _ => ImageNotFound
    }
  }

  def getImageExports(id: String) = auth.async { request =>
    elasticSearch.getImageById(id) map {
      case Some(source) if hasPermission(request, source) =>
        val links = List(
          Link("image", s"${config.rootUri}/images/$id")
        )
        respond((source \ "exports").getOrElse(JsNull), links)
      case _ => ImageNotFound
    }
  }

  def getImageExport(imageId: String, exportId: String) = auth.async { request =>
    elasticSearch.getImageById(imageId) map {
      case Some(source) if hasPermission(request, source) =>
        val exportOption = source.as[Image].exports.find(_.id.contains(exportId))
        exportOption.foldLeft(ExportNotFound)((memo, export) => respond(export))
      case _ => ImageNotFound
    }

  }



  def deleteImage(id: String) = auth.async { request =>
    elasticSearch.getImageById(id) flatMap {
      case Some(source) if hasPermission(request, source) =>
        val image = source.as[Image]

        val imageCanBeDeleted = imageResponse.canBeDeleted(image)
        if (imageCanBeDeleted) {
          canUserDeleteImage(request, source) map { canDelete =>
            if (canDelete) {
              notifications.publish(Json.obj("id" -> id), "delete-image")
              Accepted
            } else {
              ImageDeleteForbidden
            }
          }
        } else {
          Future.successful(ImageCannotBeDeleted)
        }

      case _ => Future.successful(ImageNotFound)
    }
  }

  def reindexImage(id: String) = auth.async { request =>
    val metadataCleaners = new MetadataCleaners(MetadataConfig.allPhotographersMap)
    elasticSearch.getImageById(id) flatMap {
      case Some(source) if hasPermission(request, source) =>
        // TODO: apply rights to edits API too
        // TODO: helper to abstract boilerplate
        canUserWriteMetadata(request, source) map { canWrite =>
          if (canWrite) {
            val image = source.as[Image]

            val imageMetadata = ImageMetadataConverter.fromFileMetadata(image.fileMetadata)
            val cleanMetadata = metadataCleaners.clean(imageMetadata)
            val imageCleanMetadata = image.copy(metadata = cleanMetadata, originalMetadata = cleanMetadata)
            val processedImage = SupplierProcessors.process(imageCleanMetadata)

            // FIXME: dirty hack to sync the originalUsageRights and originalMetadata as well
            val finalImage = processedImage.copy(
              originalMetadata    = processedImage.metadata,
              originalUsageRights = processedImage.usageRights
            )

            val notification = Json.toJson(finalImage)
            notifications.publish(notification, "update-image")

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
        }
      case None => Future.successful(ImageNotFound)
    }
  }

  def imageSearch = auth.async { request =>
    implicit val apiKey: ApiKey = request.user.apiKey

    val include = getIncludedFromParams(request)

    def hitToImageEntity(elasticId: String, source: JsValue): Future[EmbeddedEntity[JsValue]] = {
      val withWritePermission = canUserWriteMetadata(request, source)
      val withDeletePermission = canUserDeleteImage(request, source)

      Future.sequence(List(withWritePermission, withDeletePermission)).map {
        case List(writePermission, deletePermission) =>
          val (imageData, imageLinks, imageActions) =
            imageResponse.create(elasticId, source, writePermission, deletePermission, include)
          val id = (imageData \ "id").as[String]
          val imageUri = URI.create(s"${config.rootUri}/images/$id")
          EmbeddedEntity(uri = imageUri, data = Some(imageData), imageLinks, imageActions)
      }
    }

    def respondSuccess(searchParams: SearchParams) = for {
      SearchResults(hits, totalCount) <- elasticSearch.search(searchParams)
      imageEntities <- Future.sequence(hits map (hitToImageEntity _).tupled)
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
