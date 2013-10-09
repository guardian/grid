package controllers

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._

import lib.elasticsearch.ElasticSearch
import play.api.libs.json.{JsArray, JsObject}


object MediaApi extends Controller {

  def index = Action {
    Ok("This is the Media API.\r\n")
  }

  def getImage(id: String) = Action.async {
    ElasticSearch.getImageById(id) map {
      case Some(source) => Ok(source)
      case None         => NotFound
    }
  }

  def imageSearch = Action.async { request =>
    val term = request.getQueryString("q")
    ElasticSearch.search(term) map { hits =>
      Ok(JsObject(Seq("hits" -> JsArray(hits))))
    }
  }

}
