package controllers

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.syntax._
import lib.elasticsearch.ElasticSearch
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.ExecutionContext

class HealthCheck(auth: Authentication, elasticSearch: ElasticSearch,
                  override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController {

  def healthCheck = auth.async {
    elasticSearch.client.prepareSearch().setSize(0).executeAndLog("Health check") map (_ => Ok("OK"))
  }
}
