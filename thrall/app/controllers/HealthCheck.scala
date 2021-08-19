package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.lib.management.ElasticSearchHealthCheck
import lib._
import lib.elasticsearch._
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

class HealthCheck(elasticsearch: ElasticSearch, streamRunning: => Boolean, config: ThrallConfig, override val controllerComponents: ControllerComponents)(implicit override val ec: ExecutionContext)
  extends ElasticSearchHealthCheck(controllerComponents, elasticsearch) with ArgoHelpers {

  override def healthCheck = Action.async {
    elasticHealth.map { esHealth =>
      val problems = esHealth ++ streamRunningHealth ++ elasticsearch.migrationStatusRefresherHealth
      if (problems.nonEmpty) {
        val problemsMessage = problems.mkString(",")
        logger.warn("Healthcheck failed with problems: " + problemsMessage)
        ServiceUnavailable(problemsMessage)
      } else {
        Ok("Ok")
      }
    }
  }

  private def streamRunningHealth: Option[String] = {
    // A completed actor system whenTerminated Future is a sign that the actor system has terminated and is no longer running
    if (streamRunning)
      Some("Thrall stream appears to have stopped")
    else
      None
  }

}
