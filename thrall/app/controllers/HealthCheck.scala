package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.management.ElasticSearchHealthCheck
import lib._
import lib.elasticsearch._
import lib.kinesis.ThrallMessageConsumer
import play.api.Logger
import play.api.mvc._

import scala.concurrent.ExecutionContext

class HealthCheck(elasticsearch: ElasticSearch, messageConsumer: ThrallMessageConsumer, config: ThrallConfig, override val controllerComponents: ControllerComponents)(implicit override val ec: ExecutionContext)
  extends ElasticSearchHealthCheck(controllerComponents, elasticsearch) with ArgoHelpers {

  override def healthCheck = Action.async {
    elasticHealth.map { esHealth =>
      val problems = Seq(esHealth, actorSystemHealth).flatten
      if (problems.nonEmpty) {
        val problemsMessage = problems.mkString(",")
        Logger.warn("Healthcheck failed with problems: " + problemsMessage)
        ServiceUnavailable(problemsMessage)
      } else {
        Ok("Ok")
      }
    }
  }

  private def actorSystemHealth: Option[String] = {
    // A completed actor system whenTerminated Future is a sign that the actor system has terminated and is no longer running
    if (messageConsumer.isStopped)
      Some("Thrall consumer actor system appears to have stopped")
    else
      None
  }

}
