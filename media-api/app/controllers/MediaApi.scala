package controllers

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json._
import org.joda.time.DateTime
import scalaz.syntax.std.function2._

import com.gu.mediaservice.lib.formatting.parseDateFromQuery
import lib.elasticsearch.ElasticSearch
import lib.{Notifications, Config, S3Client}
import scala.util.Try


object MediaApi extends Controller {

  def index = Action {
    Ok("This is the Media API.\n")
  }

  def getImage(id: String) = Action.async { request =>
    val params = GeneralParams(request)
    ElasticSearch.getImageById(id) map {
      case Some(source) => Ok(imageResponse(params)(id, source))
      case None         => NotFound
    }
  }

  def deleteImage(id: String) = Action {
    Notifications.publish(Json.obj("id" -> id), "delete-image")
    Accepted
  }

  def imageSearch = Action.async { request =>
    val params = GeneralParams(request)
    val searchParams = SearchParams(request)
    ElasticSearch.search(searchParams) map { hits =>
      val images = hits map (imageResponse(params) _).tupled
      Ok(JsObject(Seq("hits" -> JsArray(images))))
    }
  }

  def imageResponse(params: GeneralParams)(id: String, source: JsValue): JsValue =
    if (params.showSecureUrl) {
      val expiration = DateTime.now.plusMinutes(15)
      val secureUrl = S3Client.signUrl(Config.s3Bucket, id, expiration)
      source.transform(addSecureUrl(secureUrl)).get
    }
    else source

  def addSecureUrl(url: String): Reads[JsObject] =
    __.json.update(__.read[JsObject].map(_ ++ Json.obj("secure-url" -> url)))

}

case class GeneralParams(showSecureUrl: Boolean)

object GeneralParams {
  
  def apply(request: Request[Any]): GeneralParams =
    GeneralParams(request.getQueryString("show-secure-url") forall (_.toBoolean))
  
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
      request.getQueryString("from-date") orElse request.getQueryString("since") flatMap parseDateFromQuery,
      request.getQueryString("to-date") orElse request.getQueryString("until") flatMap parseDateFromQuery
    )

}
