package controllers

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._

import lib.conversions._
import lib.elasticsearch.ElasticSearch


object Application extends Controller {

  ElasticSearch.ensureIndexExists

  def index = Action {
    Ok("This is the Media API.")
  }

  def pokeElasticsearch = Action {
    Async {
      for {
        searchResult <- ElasticSearch.prepareImagesSearch.execute.asScala
      } yield Ok(searchResult.getHits.getTotalHits.toString)
    }
  }

}
