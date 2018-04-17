package controllers

import com.gu.mediaservice.syntax._
import lib.elasticsearch.ElasticSearch
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.ExecutionContext

class HealthCheck(elasticSearch: ElasticSearch, override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController {

  def healthCheck = Action.async {
    elasticSearch.client.prepareSearch().setSize(0).executeAndLog("Health check") map (_ => Ok("OK"))
  }
}
