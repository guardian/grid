package controllers

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.Logger

import lib.syntax._
import lib.elasticsearch.ElasticSearch


object Application extends Controller {

  ElasticSearch.ensureIndexExists()

  def index = Action {
    Ok("This is the Media API.\r\n")
  }

  def pokeElasticsearch = Action {
    Async {
      for {
        searchResult <- ElasticSearch.prepareImagesSearch.execute.asScala
      } yield Ok(searchResult.getHits.getTotalHits.toString)
    }
  }

  def deleteIndex = Action {
    ElasticSearch.deleteIndex()
    ElasticSearch.ensureIndexExists()
    Ok("Deleted and recreated index.\r\n")
  }

  def getImageById(id: String) = Action {
    Async {
      ElasticSearch.getImageById(id) map {
        case Some(source) => Ok(source)
        case None         => NotFound
      }
    }
  }

}
