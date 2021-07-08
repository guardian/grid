package controllers

import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.config.Services
import lib.elasticsearch.ElasticSearch
import play.api.mvc.ControllerComponents

import scala.concurrent.ExecutionContext

class ThrallController(
  es: ElasticSearch,
  override val auth: Authentication,
  override val services: Services,
  override val controllerComponents: ControllerComponents
)(implicit val ec: ExecutionContext) extends BaseControllerWithLoginRedirects {

  def index = withLoginRedirectAsync {
    for {
      currentIndex <- es.getIndexForAlias(es.imagesCurrentAlias).map(indexOpt => indexOpt.map(_.index).getOrElse("ERROR - no index found! Please investigate this!"))
      migrationIndex <- es.getIndexForAlias(es.imagesMigrationAlias).map(indexOpt => indexOpt.map(_.index))
    } yield {
      Ok(views.html.index(
        currentAlias = es.imagesCurrentAlias,
        currentIndex = currentIndex,
        migrationAlias = es.imagesMigrationAlias,
        migrationIndex = migrationIndex
      ))
    }
  }

}
