package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import play.api.mvc._
import lib._
import com.gu.mediaservice.syntax._

import scala.concurrent.ExecutionContext

class HealthCheck(auth: Authentication, es: ElasticSearch, thrallMessageConsumer: ThrallMessageConsumer, config: ThrallConfig, override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  def healthCheck = auth.async {
    elasticHealth map {
      case r: Result => sqsHealth
      case _ => ServiceUnavailable("ES is not healthy")
    }
  }

  def elasticHealth = {
    es.client.prepareSearch().setSize(0)
      .executeAndLog("Health check")
      .filter(_ => !thrallMessageConsumer.actorSystem.whenTerminated.isCompleted)
      .map(_ => Ok("ES is healthy"))
  }

  def sqsHealth = {
    val timeLastMessage = thrallMessageConsumer.timeMessageLastProcessed.get

    if (timeLastMessage.plusMinutes(config.healthyMessageRate).isBeforeNow)
      ServiceUnavailable(s"Not received a message since $timeLastMessage")
    else
      Ok("SQS is healthy")
  }
}
