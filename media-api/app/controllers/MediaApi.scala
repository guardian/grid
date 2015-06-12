package controllers

import java.net.URI

import play.api.mvc.Security.AuthenticatedRequest

import scala.concurrent.Future
import scala.util.Try

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json._
import org.joda.time.{DateTime, Duration}

import uritemplate._
import Syntax._

import scalaz.syntax.std.list._

import lib.elasticsearch._
import lib.{Notifications, Config, S3Client, ImageResponse}
import lib.querysyntax.{Condition, Parser}

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.formatting.{printDateTime, parseDateFromQuery}
import com.gu.mediaservice.lib.cleanup.{SupplierProcessors, MetadataCleaners}
import com.gu.mediaservice.lib.config.MetadataConfig
import com.gu.mediaservice.lib.metadata.ImageMetadataConverter
import com.gu.mediaservice.model._
import com.gu.mediaservice.api.Transformers


object MediaApi extends Controller with ArgoHelpers {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val permissionStore = new PermissionStore(Config.configBucket, Config.awsCredentials)

  val commonTransformers = new Transformers(Config.services)

  import Config.{rootUri, cropperUri, loaderUri, metadataUri, kahunaUri, imgopsUri, loginUri}

  val Authenticated = auth.Authenticated(keyStore, loginUri, Config.kahunaUri)


  val searchParamList = List("q", "ids", "offset", "length", "fromDate", "toDate",
    "orderBy", "since", "until", "uploadedBy", "archived", "valid", "free",
    "hasExports", "hasIdentifier", "missingIdentifier", "hasMetadata").mkString(",")

  val searchLinkHref = s"$rootUri/images{?$searchParamList}"

  val indexResponse = {
    val indexData = Map("description" -> "This is the Media API")
    val indexLinks = List(
      Link("search",          searchLinkHref),
      Link("image",           s"$rootUri/images/{id}"),
      Link("metadata-search", s"$rootUri/images/metadata/{field}{?q}"),
      Link("cropper",         cropperUri),
      Link("loader",          loaderUri),
      Link("edits",           metadataUri),
      Link("session",         s"$kahunaUri/session")
    )
    respond(indexData, indexLinks)
  }

  def index = Authenticated { indexResponse }


  val ImageNotFound = respondError(NotFound, "image-not-found", "No image found with the given id")
  def getIncludedFromParams(request: AuthenticatedRequest[AnyContent, Principal]): List[String] = {
    val includedQuery: Option[String] = request.getQueryString("include")

    includedQuery.map(_.split(",").map(_.trim).toList).getOrElse(List())
  }

  def canUserWriteMetadata(request: AuthenticatedRequest[AnyContent, Principal], source: JsValue) = {
    request.user match {
      case user: PandaUser => {
        (source \ "uploadedBy").asOpt[String] match {
          case Some(uploader) if user.email == uploader => Future.successful(true)
          case _ => permissionStore.hasPermission(PermissionType.EditMetadata, user.email)
        }
      }
      case _ => Future.successful(false)
    }
  }

  def getImage(id: String) = Authenticated.async { request =>
    val include = getIncludedFromParams(request)

    ElasticSearch.getImageById(id) flatMap {
      case Some(source) => {
        val withWritePermission = canUserWriteMetadata(request, source)

        withWritePermission.map {
          permission => {
            val (imageData, imageLinks) = ImageResponse.create(id, source, permission, include)
            respond(imageData, imageLinks)
          }
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

  def deleteImage(id: String) = Authenticated {
    Notifications.publish(Json.obj("id" -> id), "delete-image")
    // TODO: use respond
    Accepted.as(ArgoMediaType)
  }

  def cleanImage(id: String) = Authenticated.async {
    val metadataCleaners = new MetadataCleaners(MetadataConfig.creditBylineMap)

    ElasticSearch.getImageById(id) map {
      case Some(source) => {
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
      }
      case None => NotFound.as(ArgoMediaType)
    }
  }


  def imageSearch = Authenticated.async { request =>
    val include = getIncludedFromParams(request)

    def hitToImageEntity(elasticId: ElasticSearch.Id, source: JsValue): Future[EmbeddedEntity[JsValue]] = {
      val withWritePermission = canUserWriteMetadata(request, source)

      withWritePermission.map { permission =>
        val (imageData, imageLinks) = ImageResponse.create(elasticId, source, permission, include)
        val id = (imageData \ "id").as[String]
        EmbeddedEntity(uri = URI.create(s"$rootUri/images/$id"), data = Some(imageData), imageLinks)
      }
    }

    val searchParams = SearchParams(request)
    for {
      SearchResults(hits, totalCount) <- ElasticSearch.search(searchParams)
      imageEntities <- Future.sequence(hits map (hitToImageEntity _).tupled)
      prevLink = getPrevLink(searchParams)
      nextLink = getNextLink(searchParams, totalCount)
      links = List(prevLink, nextLink).flatten
    } yield respondCollection(imageEntities, Some(searchParams.offset), Some(totalCount), links)
  }

  val searchTemplate = URITemplate(searchLinkHref)

  private def getSearchUrl(searchParams: SearchParams, updatedOffset: Int, length: Int): String = {

    // Enforce a toDate to exclude new images since the current request
    val toDate = searchParams.toDate.getOrElse(DateTime.now)

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
  fromDate: Option[DateTime],
  toDate: Option[DateTime],
  archived: Option[Boolean],
  hasExports: Option[Boolean],
  hasIdentifier: Option[String],
  missingIdentifier: Option[String],
  valid: Option[Boolean],
  free: Option[Boolean],
  uploadedBy: Option[String],
  labels: List[String],
  hasMetadata: List[String]
)

object SearchParams {

  def commasToList(s: String): List[String] = s.trim.split(',').toList
  def listToCommas(list: List[String]): Option[String] = list.toNel.map(_.list.mkString(","))

  def apply(request: Request[Any]): SearchParams = {

    def commaSep(key: String): List[String] = request.getQueryString(key).toList.flatMap(commasToList)

    val query = request.getQueryString("q")
    val structuredQuery = query.map(Parser.run) getOrElse List()

    SearchParams(
      query,
      structuredQuery,
      request.getQueryString("ids").map(_.split(",").toList),
      request.getQueryString("offset") flatMap (s => Try(s.toInt).toOption) getOrElse 0,
      request.getQueryString("length") flatMap (s => Try(s.toInt).toOption) getOrElse 10,
      request.getQueryString("orderBy") orElse request.getQueryString("sortBy"),
      request.getQueryString("fromDate") orElse request.getQueryString("since") flatMap parseDateFromQuery,
      request.getQueryString("toDate") orElse request.getQueryString("until") flatMap parseDateFromQuery,
      request.getQueryString("archived").map(_.toBoolean),
      request.getQueryString("hasExports").map(_.toBoolean),
      request.getQueryString("hasIdentifier"),
      request.getQueryString("missingIdentifier"),
      request.getQueryString("valid").map(_.toBoolean),
      request.getQueryString("free").map(_.toBoolean),
      request.getQueryString("uploadedBy"),
      commaSep("labels"),
      commaSep("hasMetadata")
    )
  }


  def toStringMap(searchParams: SearchParams): Map[String, String] =
    Map(
      "q"                 -> searchParams.query,
      "ids"               -> searchParams.ids.map(_.mkString(",")),
      "offset"            -> Some(searchParams.offset.toString),
      "length"            -> Some(searchParams.length.toString),
      "fromDate"          -> searchParams.fromDate.map(printDateTime),
      "toDate"            -> searchParams.toDate.map(printDateTime),
      "archived"          -> searchParams.archived.map(_.toString),
      "hasExports"        -> searchParams.hasExports.map(_.toString),
      "hasIdentifier"     -> searchParams.hasIdentifier,
      "missingIdentifier" -> searchParams.missingIdentifier,
      "valid"             -> searchParams.valid.map(_.toString),
      "free"              -> searchParams.free.map(_.toString),
      "uploadedBy"        -> searchParams.uploadedBy,
      "labels"            -> listToCommas(searchParams.labels),
      "hasMetadata"       -> listToCommas(searchParams.hasMetadata)
    ).foldLeft(Map[String, String]()) {
      case (acc, (key, Some(value))) => acc + (key -> value)
      case (acc, (_,   None))        => acc
    }

}

case class AggregateSearchParams(field: String, q: Option[String])

case class ResultsSearchParams(field: String, q: Option[String])
