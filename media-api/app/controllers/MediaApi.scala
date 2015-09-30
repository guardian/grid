package controllers

import java.net.URI

import com.gu.mediaservice.lib.config.MetadataConfig
import play.api.mvc.Security.AuthenticatedRequest

import scala.concurrent.Future
import scala.util.Try

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json._
import org.joda.time.DateTime

import uritemplate._
import Syntax._

import scalaz.syntax.std.list._

import lib.elasticsearch._
import lib.{Notifications, Config, ImageResponse}
import lib.querysyntax._

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.formatting.{printDateTime, parseDateFromQuery}
import com.gu.mediaservice.lib.cleanup.{SupplierProcessors, MetadataCleaners}
import com.gu.mediaservice.lib.metadata.ImageMetadataConverter
import com.gu.mediaservice.model._


object MediaApi extends Controller with ArgoHelpers {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val permissionStore = new PermissionStore(Config.configBucket, Config.awsCredentials)

  import Config.{rootUri, cropperUri, loaderUri, metadataUri, kahunaUri, loginUriTemplate}

  val Authenticated = auth.Authenticated(keyStore, loginUriTemplate, Config.kahunaUri)


  val searchParamList = List("q", "ids", "offset", "length", "orderBy",
    "since", "until", "modifiedSince", "modifiedUntil", "takenSince", "takenUntil",
    "uploadedBy", "archived", "valid", "free",
    "hasExports", "hasIdentifier", "missingIdentifier", "hasMetadata",
    "costModelDiff", "persisted").mkString(",")

  val searchLinkHref = s"$rootUri/images{?$searchParamList}"

  val indexResponse = {
    val indexData = Json.obj(
      "description" -> "This is the Media API",
      "configuration" -> Map(
        "mixpanelToken" -> Config.mixpanelToken
      ).collect { case (key, Some(value)) => key -> value }
      // ^ Flatten None away
    )
    val indexLinks = List(
      Link("search",          searchLinkHref),
      Link("image",           s"$rootUri/images/{id}"),
      // FIXME: credit is the only field availble for now as it's the only on
      // that we are indexing as a completion suggestion
      Link("metadata-search", s"$rootUri/suggest/metadata/{field}{?q}"),
      Link("label-search",    s"$rootUri/images/edits/label{?q}"),
      Link("cropper",         cropperUri),
      Link("loader",          loaderUri),
      Link("edits",           metadataUri),
      Link("session",         s"$kahunaUri/session"),
      Link("witness-report",  s"https://n0ticeapis.com/2/report/{id}")
    )
    respond(indexData, indexLinks)
  }

  def index = Authenticated { indexResponse }


  val ImageNotFound = respondError(NotFound, "image-not-found", "No image found with the given id")
  def getIncludedFromParams(request: AuthenticatedRequest[AnyContent, Principal]): List[String] = {
    val includedQuery: Option[String] = request.getQueryString("include")

    includedQuery.map(_.split(",").map(_.trim).toList).getOrElse(List())
  }


  def isUploaderOrHasPermission(request: AuthenticatedRequest[AnyContent, Principal], source: JsValue,
                                permission: PermissionType.PermissionType) = {
    request.user match {
      case user: PandaUser => {
        (source \ "uploadedBy").asOpt[String] match {
          case Some(uploader) if user.email.toLowerCase == uploader.toLowerCase => Future.successful(true)
          case _ => permissionStore.hasPermission(permission, user.email.toLowerCase)
        }
      }
      case _: AuthenticatedService => Future.successful(true)
      case _ => Future.successful(false)
    }
  }

  def canUserWriteMetadata(request: AuthenticatedRequest[AnyContent, Principal], source: JsValue) = {
    isUploaderOrHasPermission(request, source, PermissionType.EditMetadata)
  }

  def canUserDeleteImage(request: AuthenticatedRequest[AnyContent, Principal], source: JsValue) = {
    isUploaderOrHasPermission(request, source, PermissionType.DeleteImage)
  }

  def getImage(id: String) = Authenticated.async { request =>
    val include = getIncludedFromParams(request)

    ElasticSearch.getImageById(id) flatMap {
      case Some(source) => {
        val withWritePermission = canUserWriteMetadata(request, source)
        val withDeletePermission = canUserDeleteImage(request, source)

        Future.sequence(List(withWritePermission, withDeletePermission)).map {
          case List(writePermission, deletePermission) =>
            val (imageData, imageLinks, imageActions) =
              ImageResponse.create(id, source, writePermission, deletePermission, include)
            respond(imageData, imageLinks, imageActions)
        }
      }
      case None => Future.successful(ImageNotFound)
    }
  }

  def getImageFileMetadata(id: String) = Authenticated.async { request =>
    ElasticSearch.getImageById(id) map {
      case Some(source) => {
        val links = List(
          Link("image", s"$rootUri/images/$id")
        )
        respond(source \ "fileMetadata", links)
      }
      case None         => ImageNotFound
    }
  }


  val ImageCannotBeDeleted = respondError(MethodNotAllowed, "cannot-delete", "Cannot delete persisted images")
  val ImageDeleteForbidden = respondError(Forbidden, "delete-not-allowed", "No permission to delete this image")
  val ImageEditForbidden   = respondError(Forbidden, "edit-not-allowed", "No permission to edit this image")

  def deleteImage(id: String) = Authenticated.async { request =>
    ElasticSearch.getImageById(id) flatMap {
      case Some(source) =>
        val image = source.as[Image]

        val isPersisted = ImageResponse.imagePersistenceReasons(image).nonEmpty

        if (isPersisted) {
          Future.successful(ImageCannotBeDeleted)
        } else {
          canUserDeleteImage(request, source) map { canDelete =>
            if (canDelete) {
              Notifications.publish(Json.obj("id" -> id), "delete-image")
              Accepted
            } else {
              ImageDeleteForbidden
            }
          }
        }

      case None => Future.successful(ImageNotFound)
    }
  }


  val metadataCleaners = new MetadataCleaners(MetadataConfig.allPhotographersMap)

  def reindexImage(id: String) = Authenticated.async { request =>
    ElasticSearch.getImageById(id) flatMap {
      case Some(source) => {
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
            Notifications.publish(notification, "update-image")

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
      }
      case None => Future.successful(ImageNotFound)
    }
  }


  def imageSearch = Authenticated.async { request =>
    val include = getIncludedFromParams(request)

    def hitToImageEntity(elasticId: ElasticSearch.Id, source: JsValue): Future[EmbeddedEntity[JsValue]] = {
      val withWritePermission = canUserWriteMetadata(request, source)
      val withDeletePermission = canUserDeleteImage(request, source)

      Future.sequence(List(withWritePermission, withDeletePermission)).map {
        case List(writePermission, deletePermission) =>
          val (imageData, imageLinks, imageActions) =
            ImageResponse.create(elasticId, source, writePermission, deletePermission, include)
          val id = (imageData \ "id").as[String]
          val imageUri = URI.create(s"$rootUri/images/$id")
          EmbeddedEntity(uri = imageUri, data = Some(imageData), imageLinks, imageActions)
      }
    }

    val searchParams = SearchParams(request)

    // We search if we have a label in the search, take the first one and then look up it's
    // siblings s that we can return them as "related labels"
    val labels = searchParams.structuredQuery.flatMap {
      // TODO: Use ImageFields for guard
      case Match(field: SingleField, value:Words) if field.name == "userMetadata.labels" => Some(value.string)
      case _ => None
    }

    val (mainLabel, excludeLabels) = labels match {
      case Nil => (None, Nil)
      case label :: Nil => (Some(label), Nil)
      case label :: extraLabels => (Some(label), extraLabels)
    }

    for {
      SearchResults(hits, totalCount) <- ElasticSearch.search(searchParams)
      imageEntities <- Future.sequence(hits map (hitToImageEntity _).tupled)
      prevLink = getPrevLink(searchParams)
      nextLink = getNextLink(searchParams, totalCount)
      relatedLabels = mainLabel.map(getRelatedLabelsLink(_, excludeLabels))
      links = List(prevLink, nextLink, relatedLabels).flatten
    } yield respondCollection(imageEntities, Some(searchParams.offset), Some(totalCount), links)
  }

  val searchTemplate = URITemplate(searchLinkHref)

  private def getSearchUrl(searchParams: SearchParams, updatedOffset: Int, length: Int): String = {

    // Enforce a toDate to exclude new images since the current request
    val toDate = searchParams.until.getOrElse(DateTime.now)

    val paramMap = SearchParams.toStringMap(searchParams) ++ Map(
      "offset" -> updatedOffset.toString,
      "length" -> length.toString,
      "toDate" -> printDateTime(toDate)
    )

    val paramVars = paramMap.map { case (key, value) => key := value }.toSeq

    searchTemplate expand (paramVars: _*)
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

  private def getRelatedLabelsLink(mainLabel: String, excludeLabels: List[String] = Nil) = {
    val uriTemplate = URITemplate(s"$rootUri/suggest/edits/labels/{label}/sibling-labels{?excludeLabels}")
    val paramMap = Map(
      "label" -> Some(mainLabel),
      "excludeLabels" -> Some(excludeLabels.mkString(",")).filter(_.trim.nonEmpty)
    )
    val paramVars = paramMap.map { case (key, value) => key := value }.toSeq
    val uri = uriTemplate expand (paramVars: _*)

    Link("related-labels", uri)
  }

  def suggestMetadataCredit(q: Option[String], size: Option[Int]) = Authenticated.async { request =>
    ElasticSearch
      .completionSuggestion("suggestMetadataCredit", q.getOrElse(""), size.getOrElse(10))
      .map(c => respondCollection(c.results))
  }

  def suggestLabelSiblings(label: String, excludeLabels: Option[String]) = Authenticated.async { request =>
    val excludeLabels_ = excludeLabels.map(_.split(",").toList.map(_.trim)).getOrElse(Nil)
    ElasticSearch.labelSiblingsSearch(label, excludeLabels_) map aggregateResponse
  }

  // TODO: work with analysed fields
  // TODO: recover with HTTP error if invalid field
  def metadataSearch(field: String, q: Option[String]) = Authenticated.async { request =>
    ElasticSearch.metadataSearch(AggregateSearchParams(field, q)) map aggregateResponse
  }

  def editsSearch(field: String, q: Option[String]) = Authenticated.async { request =>
    ElasticSearch.editsSearch(AggregateSearchParams(field, q)) map aggregateResponse
  }

  // TODO: Add some useful links
  def aggregateResponse(agg: AggregateSearchResults) =
    respondCollection(agg.results, Some(0), Some(agg.total))
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
  uploadedBy: Option[String],
  labels: List[String],
  hasMetadata: List[String],
  costModelDiff: Boolean,
  persisted: Option[Boolean]
)

object SearchParams {

  def commasToList(s: String): List[String] = s.trim.split(',').toList
  def listToCommas(list: List[String]): Option[String] = list.toNel.map(_.list.mkString(","))

  // TODO: return descriptive 400 error if invalid
  def parseIntFromQuery(s: String): Option[Int] = Try(s.toInt).toOption
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
      request.getQueryString("uploadedBy"),
      commaSep("labels"),
      commaSep("hasMetadata"),
      request.getQueryString("costModelDiff") flatMap parseBooleanFromQuery getOrElse false,
      request.getQueryString("persisted") flatMap parseBooleanFromQuery
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
      "uploadedBy"        -> searchParams.uploadedBy,
      "labels"            -> listToCommas(searchParams.labels),
      "hasMetadata"       -> listToCommas(searchParams.hasMetadata),
      "costModelDiff"     -> Some(searchParams.costModelDiff.toString),
      "persisted"         -> searchParams.persisted.map(_.toString)
    ).foldLeft(Map[String, String]()) {
      case (acc, (key, Some(value))) => acc + (key -> value)
      case (acc, (_,   None))        => acc
    }

}

case class AggregateSearchParams(field: String, q: Option[String])

case class ResultsSearchParams(field: String, q: Option[String])
