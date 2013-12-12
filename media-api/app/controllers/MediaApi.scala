package controllers

import scala.concurrent.Future
import scala.util.Try

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json._
import org.joda.time.DateTime
import scalaz.NonEmptyList

import com.gu.mediaservice.lib.formatting.parseDateFromQuery
import lib.elasticsearch.ElasticSearch
import lib.{Notifications, Config, S3Client}
import lib.Buckets._
import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore


object MediaApi extends Controller {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)

  val rootUri = Config.rootUri

  def index = Action {
    val response = Json.obj(
      "data"  -> Json.obj("description" -> "This is the Media API"),
      "links" -> Json.arr(
        Json.obj("rel" -> "search", "href" -> s"$rootUri/images{?q,offset,length,from-date,to-date}"),
        Json.obj("rel" -> "image",  "href" -> s"$rootUri/images/{id}")
      )
    )
    Ok(response)
  }

  val Authenticated = auth.Authenticated(keyStore)(_ => Unauthorized(Json.obj("errorKey" -> "unauthorized")))

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

  private def bucketNotification(imageId: String, subject: String): Request[AnyContent] => Future[SimpleResult] =
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
    ElasticSearch.search(searchParams) map { hits =>
      val images = hits map (imageResponse(params) _).tupled
      Ok(Json.obj(
        "offset" -> searchParams.offset,
        "length" -> searchParams.length,
        "data"   -> images
      ))
    }
  }

  def imageResponse(params: GeneralParams)(id: String, source: JsValue): JsValue =
    if (params.showSecureUrl) {
      val expiration = DateTime.now.plusMinutes(15)
      val secureUrl = S3Client.signUrl(Config.imageBucket, id, expiration)
      val secureThumbUrl = S3Client.signUrl(Config.thumbBucket, id, expiration)
      val image = source.transform(transformers.addSecureImageUrl(secureUrl))
        .flatMap(_.transform(transformers.addSecureThumbUrl(secureThumbUrl))).get
      Json.obj("uri" -> s"$rootUri/images/$id", "data" -> image)
    }
    else source

  def getAllBuckets = Authenticated.async {
    for (buckets <- ElasticSearch.getAllBuckets)
    yield Ok(Json.obj("data" -> buckets))
  }

  object transformers {

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
  buckets: Option[NonEmptyList[String]]
)

object SearchParams {

  import scalaz.syntax.std.list._

  def apply(request: Request[Any]): SearchParams =
    SearchParams(
      request.getQueryString("q"),
      request.getQueryString("offset") flatMap (s => Try(s.toInt).toOption) getOrElse 0,
      request.getQueryString("length") flatMap (s => Try(s.toInt).toOption) getOrElse 10,
      request.getQueryString("order-by") orElse request.getQueryString("sort-by"),
      request.getQueryString("from-date") orElse request.getQueryString("since") flatMap parseDateFromQuery,
      request.getQueryString("to-date") orElse request.getQueryString("until") flatMap parseDateFromQuery,
      request.getQueryString("bucket") flatMap (s => s.trim.split(',').toList.toNel)
    )

}
