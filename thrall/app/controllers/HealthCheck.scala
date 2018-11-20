package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import play.api.mvc._
import lib._
import com.gu.mediaservice.syntax._

import scala.concurrent.ExecutionContext

class HealthCheck(elasticsearch: ElasticSearch, thrallMessageConsumer: ThrallMessageConsumer, config: ThrallConfig, override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  def healthCheck = Action.async {
    elasticHealth map {
      case r: Result => sqsHealth
      case _ => ServiceUnavailable("ES is not healthy")
    }
  }

  private def elasticHealth = {
    elasticsearch.client.prepareSearch().setSize(0)
      .executeAndLog("Health check")
      .filter(_ => !thrallMessageConsumer.isTerminated)
      .map(_ => Ok("ES is healthy"))
  }

  private def sqsHealth = {
    val timeLastMessage = thrallMessageConsumer.timeMessageLastProcessed.get

    if (timeLastMessage.plusMinutes(config.healthyMessageRate).isBeforeNow)
      ServiceUnavailable(s"Not received a message since $timeLastMessage")
    else
      Ok("SQS is healthy")
  }
}
