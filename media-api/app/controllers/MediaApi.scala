package controllers

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json._
import org.joda.time.DateTime
import scalaz.syntax.std.function2._

import com.gu.mediaservice.lib.formatting.parseDateTime
import lib.elasticsearch.ElasticSearch
import lib.{Notifications, Config, S3Client}
import scala.util.Try

object MediaApi extends Controller {

  def index = Action {
    Ok("This is the Media API.\n")
  }

  def getImage(id: String) = Action.async {
    ElasticSearch.getImageById(id) map {
      case Some(source) => Ok(imageResponse(id, source))
      case None         => NotFound
    }
  }

  def deleteImage(id: String) = Action {
    Notifications.publish(Json.obj("id" -> id), "delete-image")
    Accepted
  }

  def imageSearch = Action.async { request =>
    val params = SearchParams(request)
    ElasticSearch.search(params) map { hits =>
      val images = hits map (imageResponse _).tupled
      Ok(JsObject(Seq("hits" -> JsArray(images))))
    }
  }

  def imageResponse(id: String, source: JsValue): JsValue = {
    val expiration = DateTime.now.plusMinutes(15)
    val secureUrl = S3Client.signUrl(Config.s3Bucket, id, expiration)
    source.transform(addSecureUrl(secureUrl)).get
  }

  def addSecureUrl(url: String): Reads[JsObject] =
    __.json.update(__.read[JsObject].map(_ ++ Json.obj("secure-url" -> url)))

}

case class SearchParams(
  query: Option[String],
  size: Option[Int],
  orderBy: Option[String],
  fromDate: Option[DateTime],
  toDate: Option[DateTime]
)

object SearchParams {

  def apply(request: Request[Any]): SearchParams =
    SearchParams(
      request.getQueryString("q"),
      request.getQueryString("size") flatMap (s => Try(s.toInt).toOption),
      request.getQueryString("order-by") orElse request.getQueryString("sort-by"),
      request.getQueryString("from-date") flatMap parseDateTime,
      request.getQueryString("to-date") flatMap parseDateTime
    )

}
