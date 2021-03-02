package com.gu.mediaservice.lib.management

import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.auth.provider.AuthorisationProvider
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, ElasticSearchImageCounts}
import com.gu.mediaservice.lib.logging.GridLogging
import play.api.libs.json.{Format, Json}
import play.api.mvc.{Action, AnyContent, BaseController, ControllerComponents}

import scala.concurrent.{ExecutionContext, Future}

trait BuildInfo {
  def toJson: String
}

trait HealthCheck extends BaseController {
  def healthCheck: Action[AnyContent] = Action {
    Ok("OK")
  }
}

trait ManagementController extends HealthCheck with BaseController with ArgoHelpers {
  def buildInfo: BuildInfo

  def disallowRobots = Action {
    Ok("User-agent: *\nDisallow: /\n")
  }

  def manifest = Action {
    Ok(Json.parse(buildInfo.toJson))
  }
}

class Management(override val controllerComponents: ControllerComponents, override val buildInfo: BuildInfo) extends ManagementController

class ElasticSearchHealthCheck(override val controllerComponents: ControllerComponents, elasticsearch: ElasticSearchClient)(implicit val ec: ExecutionContext)
  extends HealthCheck with GridLogging {

  override def healthCheck: Action[AnyContent] = Action.async {
    elasticHealth.map {
      case None => Ok("Ok")
      case Some(err) => {
        logger.warn(s"Healthcheck failed with problems: $err")
        ServiceUnavailable(err)
      }
    }
  }

  protected def elasticHealth: Future[Option[String]] = {
    elasticsearch.healthCheck().map { result =>
      if (!result) {
        Some("Elastic search call failed")
      } else {
        None
      }
    }
  }

  def imageCounts: Action[AnyContent] = Action.async {
    implicit val imageCountsFormat: Format[ElasticSearchImageCounts] =
      Json.format[ElasticSearchImageCounts]

    elasticsearch.countImages().map {
      case counts: ElasticSearchImageCounts =>
        Ok(Json.toJson(counts))
      case _ =>
        logger.warn(s"Can't get stats")
        ServiceUnavailable("Can't get stats")
    }
  }

}
