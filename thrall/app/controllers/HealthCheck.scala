package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import lib._
import play.api.Logger
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

class HealthCheck(elasticsearch: ElasticSearchVersion, messageConsumer: MessageConsumerVersion, override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  def healthCheck = Action.async {
    elasticHealth.map { esHealth =>
      val problems = Seq(esHealth, actorSystemHealth).flatten
      if (problems.nonEmpty) {
        val problemsMessage = problems.mkString(",")
        Logger.warn("Health check failed with problems: " + problemsMessage)
        ServiceUnavailable(problemsMessage)
      } else {
        Ok("Ok")
      }
    }
  }

  private def elasticHealth: Future[Option[String]] = {
    elasticsearch.healthCheck().map { result =>
      if (!result) {
        Some("Elastic search call failed")
      } else {
        None
      }
    }
  }

  private def actorSystemHealth: Option[String] = {
    // A completed actor system whenTerminated Future is a sign that the actor system has terminated and is no longer running
    if (messageConsumer.isStopped)
      Some("Thrall consumer appears to have stopped")
    else
      None
  }

}
