package controllers

import java.net.URI

import scala.util.Try

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json._
import org.joda.time.{DateTime, Duration}

import uritemplate._
import Syntax._

import scalaz.syntax.std.list._

import lib.elasticsearch._
import lib.{Notifications, Config, S3Client}
import lib.querysyntax.{Condition, Parser}

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
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

  def getImage(id: String) = Authenticated.async { request =>
    ElasticSearch.getImageById(id) map {
      case Some(source) => {
        val (imageData, imageLinks) = imageResponse(id, source)
        respond(imageData, imageLinks)
      }
      case None         => ImageNotFound
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
        val fileMetadata = (source \ "fileMetadata").as[FileMetadata]
        val imageMetadata = ImageMetadataConverter.fromFileMetadata(fileMetadata)
        val cleanMetadata = metadataCleaners.clean(imageMetadata)

        val notification = Json.obj("id" -> id, "data" -> Json.toJson(cleanMetadata))
        Notifications.publish(notification, "update-image-metadata")

        Ok(Json.obj(
          "id" -> id,
          "changed" -> JsBoolean(imageMetadata != cleanMetadata),
          "data" -> Json.obj(
            "oldMetadata" -> imageMetadata,
            "cleanMetadata" -> cleanMetadata
          )
        ))
      }
      case None => NotFound.as(ArgoMediaType)
    }
  }


  def imageSearch = Authenticated.async { request =>
    val searchParams = SearchParams(request)
    ElasticSearch.search(searchParams) map { case SearchResults(hits, totalCount) =>
      val images = hits map (imageResponse _).tupled
      val imageEntities = images.map { case (imageData, imageLinks) =>
        val id = (imageData \ "id").as[String]
        EmbeddedEntity(uri = URI.create(s"$rootUri/images/$id"), data = Some(imageData), imageLinks)
      }

      val prevLink = getPrevLink(searchParams)
      val nextLink = getNextLink(searchParams, totalCount)
      val links = List(prevLink, nextLink).flatten

      respondCollection(imageEntities, Some(searchParams.offset), Some(totalCount), links)
    }
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


  def imageResponse(id: String, source: JsValue): (JsValue, List[Link]) = {
    // Round expiration time to try and hit the cache as much as possible
    // TODO: do we really need these expiration tokens? they kill our ability to cache...
    val expiration = roundDateTime(DateTime.now, Duration.standardMinutes(10)).plusMinutes(20)
    val fileUri = new URI((source \ "source" \ "file").as[String])
    val secureUrl = S3Client.signUrl(Config.imageBucket, fileUri, expiration)
    val secureThumbUrl = S3Client.signUrl(Config.thumbBucket, fileUri, expiration)

    val creditField = (source \ "metadata" \ "credit").as[Option[String]]
    val sourceField = (source \ "metadata" \ "source").as[Option[String]]
    val usageRightsField = (source \ "userMetadata" \ "usageRights").asOpt[UsageRights]
    val valid = ImageExtras.isValid(source \ "metadata")

    val imageData = source.transform(transformers.addSecureSourceUrl(secureUrl))
      .flatMap(_.transform(transformers.addSecureThumbUrl(secureThumbUrl)))
      .flatMap(_.transform(transformers.removeFileData))
      .flatMap(_.transform(transformers.addFileMetadataUrl(s"$rootUri/images/$id/fileMetadata")))
      .flatMap(_.transform(transformers.wrapUserMetadata(id)))
      .flatMap(_.transform(transformers.addValidity(valid)))
      .flatMap(_.transform(transformers.addUsageCost(creditField, sourceField, usageRightsField))).get

    val cropLink = Link("crops", s"$cropperUri/crops/$id")
    val staticLinks = List(
      Link("edits",     s"$metadataUri/metadata/$id"),
      Link("optimised", makeImgopsUri(new URI(secureUrl)))
    )
    val imageLinks = if (valid) {
      cropLink :: staticLinks
    } else {
      staticLinks
    }

    (imageData, imageLinks)
  }

  object transformers {

    def addUsageCost(credit: Option[String], source: Option[String], usageRights: Option[UsageRights]): Reads[JsObject] =
      __.json.update(__.read[JsObject].map(_ ++ Json.obj("cost" -> ImageExtras.getCost(credit, source, usageRights).toString)))

    def removeFileData: Reads[JsObject] =
      (__ \ "fileMetadata").json.prune

    def addFileMetadataUrl(url: String): Reads[JsObject] =
      __.json.update(__.read[JsObject].map (_ ++ Json.obj("fileMetadata" -> Json.obj("uri" -> url))))

    // FIXME: tidier way to replace a key in a JsObject?
    def wrapUserMetadata(id: String): Reads[JsObject] =
      __.read[JsObject].map { root =>
        val userMetadata = commonTransformers.objectOrEmpty(root \ "userMetadata")
        val wrappedUserMetadata = userMetadata.transform(commonTransformers.wrapAllMetadata(id)).get
        root ++ Json.obj("userMetadata" -> wrappedUserMetadata)
      }

    def addSecureSourceUrl(url: String): Reads[JsObject] =
      (__ \ "source").json.update(__.read[JsObject].map(_ ++ Json.obj("secureUrl" -> url)))

    def addSecureThumbUrl(url: String): Reads[JsObject] =
      (__ \ "thumbnail").json.update(__.read[JsObject].map (_ ++ Json.obj("secureUrl" -> url)))

    def addValidity(valid: Boolean): Reads[JsObject] =
      __.json.update(__.read[JsObject]).map(_ ++ Json.obj("valid" -> valid))
  }

  def makeImgopsUri(uri: URI): String =
    imgopsUri + List(uri.getPath, uri.getRawQuery).mkString("?") + "{&w,h,q}"

  def roundDateTime(t: DateTime, d: Duration) = {
    t minus (t.getMillis - (t.getMillis.toDouble / d.getMillis).round * d.getMillis)
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

// Default to pay for now
object ImageExtras {
  def isValid(metadata: JsValue): Boolean =
    Config.requiredMetadata.forall(field => (metadata \ field).asOpt[String].isDefined)

  def getCost(credit: Option[String], source: Option[String], usageRights: Option[UsageRights]): Cost = {
    val freeCredit      = credit.exists(isFreeCredit)
    val freeSource      = source.exists(isFreeSource)
    val payingSource    = source.exists(isPaySource)

    usageRights.map(_.cost).getOrElse {
      if ((freeCredit || freeSource) && ! payingSource) Free
      else Pay
    }
  }

  private def isFreeCredit(credit: String) = Config.freeCreditList.exists(f => f.toLowerCase == credit.toLowerCase)
  private def isFreeSource(source: String) = Config.freeSourceList.exists(f => f.toLowerCase == source.toLowerCase)
  private def isPaySource(source: String)  = Config.payGettySourceList.exists(f => f.toLowerCase == source.toLowerCase)
}
