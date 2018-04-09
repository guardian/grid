package controllers

import java.net.URI

import com.gu.editorial.permissions.client.Permission
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.auth.Authentication.{AuthenticatedService, PandaUser, Principal}
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.cleanup.{MetadataCleaners, SupplierProcessors}
import com.gu.mediaservice.lib.config.MetadataConfig
import com.gu.mediaservice.lib.formatting.{parseDateFromQuery, printDateTime}
import com.gu.mediaservice.lib.metadata.ImageMetadataConverter
import com.gu.mediaservice.model._
import lib.elasticsearch._
import lib.querysyntax._
import lib.{ImageResponse, MediaApiConfig, Notifications}
import org.joda.time.DateTime
import play.api.libs.json._
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._
import scalaz.syntax.applicative._
import scalaz.syntax.std.list._
import scalaz.syntax.validation._
import scalaz.{Validation, ValidationNel}
import org.http4s.{Uri, UriTemplate}
import org.http4s.UriTemplate.Path

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try


class MediaApi(auth: Authentication, config: MediaApiConfig, notifications: Notifications, elasticSearch: ElasticSearch, imageResponse: ImageResponse,
               override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  val searchParamList = List("q", "ids", "offset", "length", "orderBy",
    "since", "until", "modifiedSince", "modifiedUntil", "takenSince", "takenUntil",
    "uploadedBy", "archived", "valid", "free", "payType",
    "hasExports", "hasIdentifier", "missingIdentifier", "hasMetadata",
    "persisted", "usageStatus", "usagePlatform").mkString(",")

  private val searchLinkHref = s"${config.rootUri}/images{?$searchParamList}"

  private val searchLink = Link("search", searchLinkHref)

  val indexResponse = {
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

  def index = auth { indexResponse }


  val ImageNotFound = respondError(NotFound, "image-not-found", "No image found with the given id")
  val ExportNotFound = respondError(NotFound, "export-not-found", "No export found with the given id")

  def getIncludedFromParams(request: AuthenticatedRequest[AnyContent, Principal]): List[String] = {
    val includedQuery: Option[String] = request.getQueryString("include")

    includedQuery.map(_.split(",").map(_.trim).toList).getOrElse(List())
  }


  def isUploaderOrHasPermission(
    request: AuthenticatedRequest[AnyContent, Principal],
    source: JsValue,
    permission: Permission
  ) = {
    request.user match {
      case user: PandaUser =>
        (source \ "uploadedBy").asOpt[String] match {
          case Some(uploader) if user.user.email.toLowerCase == uploader.toLowerCase => Future.successful(true)
          case _ => PermissionsHandler.hasPermission(user, permission)
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

  def getImage(id: String) = auth.async { request =>
    val include = getIncludedFromParams(request)

    elasticSearch.getImageById(id) flatMap {
      case Some(source) =>
        val withWritePermission = canUserWriteMetadata(request, source)
        val withDeletePermission = canUserDeleteImage(request, source)

        Future.sequence(List(withWritePermission, withDeletePermission)).map {
          case List(writePermission, deletePermission) =>
            val (imageData, imageLinks, imageActions) =
              imageResponse.create(id, source, writePermission, deletePermission, include)
            respond(imageData, imageLinks, imageActions)
        }
      case None => Future.successful(ImageNotFound)
    }
  }

  def getImageFileMetadata(id: String) = auth.async { request =>
    elasticSearch.getImageById(id) map {
      case Some(source) =>
        val links = List(
          Link("image", s"${config.rootUri}/images/$id")
        )
        respond((source \ "fileMetadata").getOrElse(JsNull), links)
      case None => ImageNotFound
    }
  }

  def getImageExports(id: String) = auth.async { request =>
    elasticSearch.getImageById(id) map {
      case Some(source) =>
        val links = List(
          Link("image", s"${config.rootUri}/images/$id")
        )
        respond((source \ "exports").getOrElse(JsNull), links)
      case None         => ImageNotFound
    }
  }

  def getImageExport(imageId: String, exportId: String) = auth.async { _ =>
    elasticSearch.getImageById(imageId) map {
      case Some(source) =>
        val exportOption = source.as[Image].exports.find(_.id.contains(exportId))
        exportOption.foldLeft(ExportNotFound)((memo, export) => respond(export))
      case None => ImageNotFound
    }

  }

  val ImageCannotBeDeleted = respondError(MethodNotAllowed, "cannot-delete", "Cannot delete persisted images")
  val ImageDeleteForbidden = respondError(Forbidden, "delete-not-allowed", "No permission to delete this image")
  val ImageEditForbidden   = respondError(Forbidden, "edit-not-allowed", "No permission to edit this image")

  def deleteImage(id: String) = auth.async { request =>
    elasticSearch.getImageById(id) flatMap {
      case Some(source) =>
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

      case None => Future.successful(ImageNotFound)
    }
  }


  val metadataCleaners = new MetadataCleaners(MetadataConfig.allPhotographersMap)

  def reindexImage(id: String) = auth.async { request =>
    elasticSearch.getImageById(id) flatMap {
      case Some(source) =>
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

  //s"${config.rootUri}/images{?$searchParamList}"
  val searchTemplate = UriTemplate()

  private def getSearchUrl(searchParams: SearchParams, updatedOffset: Int, length: Int): String = {

    // Enforce a toDate to exclude new images since the current request
    val toDate = searchParams.until.getOrElse(DateTime.now)

    val paramMap: Map[String, String] = SearchParams.toStringMap(searchParams) ++ Map(
      "offset" -> updatedOffset.toString,
      "length" -> length.toString,
      "toDate" -> printDateTime(toDate)
    )

    paramMap.foldLeft(searchTemplate){ (acc, pair) => acc.expandAny(pair._1, pair._2)}.toString
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

case class SearchParams(
  query: Option[String],
  structuredQuery: List[Condition],
  ids: Option[List[String]],
  offset: Int,
  length: Int,
  orderBy: Option[String],
  since: Option[DateTime],
  until: Option[DateTime],
  modifiedSince: Option[DateTime],
  modifiedUntil: Option[DateTime],
  takenSince: Option[DateTime],
  takenUntil: Option[DateTime],
  archived: Option[Boolean],
  hasExports: Option[Boolean],
  hasIdentifier: Option[String],
  missingIdentifier: Option[String],
  valid: Option[Boolean],
  free: Option[Boolean],
  payType: Option[PayType.Value],
  hasRightsCategory: Option[Boolean],
  uploadedBy: Option[String],
  labels: List[String],
  hasMetadata: List[String],
  persisted: Option[Boolean],
  usageStatus: List[String],
  usagePlatform: List[String]
)

case class InvalidUriParams(message: String) extends Throwable
object InvalidUriParams {
  val errorKey = "invalid-uri-parameters"
}

object PayType extends Enumeration {
  type PayType = Value
  val Free = Value("free")
  val MaybeFree = Value("maybe-free")
  val All = Value("all")
  val Pay = Value("pay")

  def create(s: String) = s match {
    case "free" => Some(Free)
    case "maybe-free" => Some(MaybeFree)
    case "all" => Some(All)
    case "pay" => Some(Pay)
    case _ => None
  }
}

object SearchParams {


  def commasToList(s: String): List[String] = s.trim.split(',').toList
  def listToCommas(list: List[String]): Option[String] = list.toNel.map(_.list.mkString(","))

  // TODO: return descriptive 400 error if invalid
  def parseIntFromQuery(s: String): Option[Int] = Try(s.toInt).toOption
  def parsePayTypeFromQuery(s: String): Option[PayType.Value] = PayType.create(s)
  def parseBooleanFromQuery(s: String): Option[Boolean] = Try(s.toBoolean).toOption

  def apply(request: Request[Any]): SearchParams = {

    def commaSep(key: String): List[String] = request.getQueryString(key).toList.flatMap(commasToList)

    val query = request.getQueryString("q")
    val structuredQuery = query.map(Parser.run) getOrElse List()

    SearchParams(
      query,
      structuredQuery,
      request.getQueryString("ids").map(_.split(",").toList),
      request.getQueryString("offset") flatMap parseIntFromQuery getOrElse 0,
      request.getQueryString("length") flatMap parseIntFromQuery getOrElse 10,
      request.getQueryString("orderBy"),
      request.getQueryString("since") flatMap parseDateFromQuery,
      request.getQueryString("until") flatMap parseDateFromQuery,
      request.getQueryString("modifiedSince") flatMap parseDateFromQuery,
      request.getQueryString("modifiedUntil") flatMap parseDateFromQuery,
      request.getQueryString("takenSince") flatMap parseDateFromQuery,
      request.getQueryString("takenUntil") flatMap parseDateFromQuery,
      request.getQueryString("archived") flatMap parseBooleanFromQuery,
      request.getQueryString("hasExports") flatMap parseBooleanFromQuery,
      request.getQueryString("hasIdentifier"),
      request.getQueryString("missingIdentifier"),
      request.getQueryString("valid") flatMap parseBooleanFromQuery,
      request.getQueryString("free") flatMap parseBooleanFromQuery,
      request.getQueryString("payType") flatMap parsePayTypeFromQuery,
      request.getQueryString("hasRightsCategory") flatMap parseBooleanFromQuery,
      request.getQueryString("uploadedBy"),
      commaSep("labels"),
      commaSep("hasMetadata"),
      request.getQueryString("persisted") flatMap parseBooleanFromQuery,
      commaSep("usageStatus"),
      commaSep("usagePlatform")
    )
  }


  def toStringMap(searchParams: SearchParams): Map[String, String] =
    Map(
      "q"                 -> searchParams.query,
      "ids"               -> searchParams.ids.map(_.mkString(",")),
      "offset"            -> Some(searchParams.offset.toString),
      "length"            -> Some(searchParams.length.toString),
      "since"             -> searchParams.since.map(printDateTime),
      "until"             -> searchParams.until.map(printDateTime),
      "modifiedSince"     -> searchParams.modifiedSince.map(printDateTime),
      "modifiedUntil"     -> searchParams.modifiedUntil.map(printDateTime),
      "takenSince"        -> searchParams.takenSince.map(printDateTime),
      "takenUntil"        -> searchParams.takenUntil.map(printDateTime),
      "archived"          -> searchParams.archived.map(_.toString),
      "hasExports"        -> searchParams.hasExports.map(_.toString),
      "hasIdentifier"     -> searchParams.hasIdentifier,
      "missingIdentifier" -> searchParams.missingIdentifier,
      "valid"             -> searchParams.valid.map(_.toString),
      "free"              -> searchParams.free.map(_.toString),
      "payType"           -> searchParams.payType.map(_.toString),
      "uploadedBy"        -> searchParams.uploadedBy,
      "labels"            -> listToCommas(searchParams.labels),
      "hasMetadata"       -> listToCommas(searchParams.hasMetadata),
      "persisted"         -> searchParams.persisted.map(_.toString),
      "usageStatus"       -> listToCommas(searchParams.usageStatus),
      "usagePlatform"     -> listToCommas(searchParams.usagePlatform)
    ).foldLeft(Map[String, String]()) {
      case (acc, (key, Some(value))) => acc + (key -> value)
      case (acc, (_,   None))        => acc
    }

    type SearchParamValidation = Validation[InvalidUriParams, SearchParams]
    type SearchParamValidations = ValidationNel[InvalidUriParams, SearchParams]
    val maxSize = 200

    def validate(searchParams: SearchParams): SearchParamValidations = {
      // we just need to return the first `searchParams` as we don't need to manipulate them
      // TODO: try reduce these
      (validateLength(searchParams).toValidationNel |@| validateOffset(searchParams).toValidationNel)((s1, s2) => s1)
    }

    def validateOffset(searchParams: SearchParams): SearchParamValidation = {
      if (searchParams.offset < 0) InvalidUriParams("offset cannot be less than 0").failure else searchParams.success
    }

    def validateLength(searchParams: SearchParams): SearchParamValidation = {
      if (searchParams.length > maxSize) InvalidUriParams(s"length cannot exceed $maxSize").failure else searchParams.success
    }

}
