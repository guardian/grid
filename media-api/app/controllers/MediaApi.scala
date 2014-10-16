package controllers


import scala.concurrent.Future
import scala.util.Try

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json._
import org.joda.time.DateTime

import com.gu.mediaservice.lib.formatting.parseDateFromQuery
import lib.elasticsearch.{ElasticSearch, SearchResults}
import lib.{Notifications, Config, S3Client}
import lib.Buckets._
import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore


object MediaApi extends Controller {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)

  val rootUri = Config.rootUri
  val cropperUri = Config.cropperUri

  def index = Action {
    val response = Json.obj(
      "data"  -> Json.obj("description" -> "This is the Media API"),
      "links" -> Json.arr(
        Json.obj("rel" -> "search", "href" -> s"$rootUri/images{?q,offset,length,fromDate,toDate,orderBy}"),
        Json.obj("rel" -> "image",  "href" -> s"$rootUri/images/{id}"),
        Json.obj("rel" -> "cropper", "href" -> cropperUri)
      )
    )
    Ok(response)
  }

  val Authenticated = auth.Authenticated(keyStore, Config.kahunaUri)

  def getImage(id: String) = Authenticated.async { request =>
    val params = GeneralParams(request)
    ElasticSearch.getImageById(id) map {
      case Some(source) => Ok(imageResponse(params)(id, source))
      case None         => NotFound
    }
  }

  def deleteImage(id: String) = Authenticated {
    Notifications.publish(Json.obj("id" -> id), "delete-image")
    Accepted
  }

  def addImageToBucket(id: String) = Authenticated.async { bucketNotification(id, "add-image-to-bucket") }

  def removeImageFromBucket(id: String) = Authenticated.async { bucketNotification(id, "remove-image-from-bucket") }

  private def bucketNotification(imageId: String, subject: String): Request[AnyContent] => Future[Result] =
    request => request.body.asText.filter(validBucket) match {
      case Some(bucket) =>
        for (exists <- ElasticSearch.imageExists(imageId)) yield
          if (exists) {
            Notifications.publish(Json.obj("id" -> imageId, "bucket" -> bucket), subject)
            Accepted
          }
          else NotFound
      case None => Future.successful(BadRequest("Invalid bucket name"))
    }

  def imageSearch = Authenticated.async { request =>
    val params = GeneralParams(request)
    val searchParams = SearchParams(request)
    ElasticSearch.search(searchParams) map { case SearchResults(hits, totalCount) =>
      val images = hits map (imageResponse(params) _).tupled
      Ok(Json.obj(
        "offset" -> searchParams.offset,
        "length" -> images.size,
        "total"  -> totalCount,
        "data"   -> images
      ))
    }
  }

  def imageResponse(params: GeneralParams)(id: String, source: JsValue): JsValue =
    if (params.showSecureUrl) {
      val expiration = DateTime.now.plusMinutes(15)
      val secureUrl = S3Client.signUrl(Config.imageBucket, id, expiration)
      val secureThumbUrl = S3Client.signUrl(Config.thumbBucket, id, expiration)
      val credit = (source \ "metadata" \ "credit").as[Option[String]]
      val image = source.transform(transformers.addSecureImageUrl(secureUrl))
        .flatMap(_.transform(transformers.addSecureThumbUrl(secureThumbUrl)))
        .flatMap(_.transform(transformers.addUsageCost(credit))).get

      // FIXME: don't hardcode paths from other APIs - once we're
      // storing a copy of the data in the DB, we can use it to point
      // to the right place
      val links = List(Json.obj("rel" -> "crops", "href" -> s"$cropperUri/crops/$id"))
      Json.obj("uri" -> s"$rootUri/images/$id", "data" -> image, "links" -> links)
    }
    else source
  // TODO: always add most transformers even if no showSecureUrl

  object transformers {

    def addUsageCost(copyright: Option[String]): Reads[JsObject] =
      __.json.update(__.read[JsObject].map(_ ++ Json.obj("cost" -> ImageUse.getCost(copyright))))

    def addSecureImageUrl(url: String): Reads[JsObject] =
      __.json.update(__.read[JsObject].map(_ ++ Json.obj("secureUrl" -> url)))

    def addSecureThumbUrl(url: String): Reads[JsObject] =
      (__ \ "thumbnail").json.update(__.read[JsObject].map (_ ++ Json.obj("secureUrl" -> url)))
  }

}

case class GeneralParams(showSecureUrl: Boolean)

object GeneralParams {

  def apply(request: Request[Any]): GeneralParams =
    GeneralParams(request.getQueryString("show-secure-url") forall (_.toBoolean))

}

case class SearchParams(
  query: Option[String],
  offset: Int,
  length: Int,
  orderBy: Option[String],
  fromDate: Option[DateTime],
  toDate: Option[DateTime],
  archived: Option[Boolean],
  buckets: List[String],
  hasMetadata: List[String]
)

object SearchParams {

  def apply(request: Request[Any]): SearchParams = {

    def commaSep(key: String): List[String] = request.getQueryString(key).toList.flatMap(_.trim.split(','))

    SearchParams(
      request.getQueryString("q"),
      request.getQueryString("offset") flatMap (s => Try(s.toInt).toOption) getOrElse 0,
      request.getQueryString("length") flatMap (s => Try(s.toInt).toOption) getOrElse 10,
      request.getQueryString("orderBy") orElse request.getQueryString("sortBy"),
      request.getQueryString("fromDate") orElse request.getQueryString("since") flatMap parseDateFromQuery,
      request.getQueryString("toDate") orElse request.getQueryString("until") flatMap parseDateFromQuery,
      request.getQueryString("archived").map(_.toBoolean),
      commaSep("bucket"),
      commaSep("hasMetadata")
    )
  }

}

// Default to pay for now
object ImageUse {
  val freeForUseFrom: Seq[String] = Seq("EPA", "REUTERS", "PA", "AP", "Associated Press", "RONALD GRANT",
    "Press Association Images", "Action Images", "Keystone", "AFP", "Getty Images", "Alamy", "FilmMagic", "WireImage",
    "Pool", "Rex Features", "Allsport", "BFI", "ANSA", "The Art Archive", "Hulton Archive", "Hulton Getty", "RTRPIX",
    "Community Newswire", "THE RONALD GRANT ARCHIVE", "NPA ROTA", "Ronald Grant Archive", "PA WIRE", "AP POOL",
    "REUTER", "dpa", "BBC", "Allstar Picture Library", "AFP/Getty Images")

  def getCost(credit: Option[String]) = {
    credit match {
      case Some(c) if freeForUseFrom.exists(f => f.toLowerCase == c.toLowerCase) => "free"
      case _ => "pay"
    }
  }
}
