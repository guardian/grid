package controllers

import play.api.mvc.{Action, Controller}
import com.gu.mediaservice.lib.elasticsearch.ElasticSearch
import lib.elasticsearch.ElasticSearch


object IndexManagement extends Controller {

  def deleteIndex = Action {
    ElasticSearch.deleteIndex()
    ElasticSearch.ensureIndexExists()
    Ok("Deleted and recreated index.\r\n")
  }

}
