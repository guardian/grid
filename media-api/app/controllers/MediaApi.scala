package controllers

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json._

import lib.elasticsearch.ElasticSearch
import lib.{Config, S3}
import org.joda.time.DateTime

object MediaApi extends Controller {

  def index = Action {
    Ok("This is the Media API.\r\n")
  }

  def getImage(id: String) = Action.async {
    ElasticSearch.getImageById(id) map {
      case Some(source) => Ok(imageResponse(id, source))
      case None         => NotFound
    }
  }

  def imageSearch = Action.async { request =>
    val term = request.getQueryString("q")
    ElasticSearch.search(term) map { hits =>
      Ok(JsObject(Seq("hits" -> JsArray(hits))))
    }
  }

  def imageResponse(id: String, source: JsValue): JsValue = {
    val expiration = DateTime.now.plusMinutes(15)
    val secureUrl = S3.signUrl(Config.s3Bucket, id, expiration)
    source.transform(addSecureUrl(secureUrl)).get
  }

  def addSecureUrl(url: String): Reads[JsObject] =
    __.json.update(__.read[JsObject].map(_ ++ Json.obj("secureUrl" -> url)))

}
