package controllers

import play.api.mvc.{Action, Controller}
import play.api.libs.concurrent.Execution.Implicits._
import lib.ElasticSearch
import com.gu.mediaservice.syntax._

object HealthCheck extends Controller {

  def healthCheck = Action.async {
    ElasticSearch.client.prepareSearch().setSize(0).executeAndLog("Health check") map (_ => Ok("OK"))
  }

}
