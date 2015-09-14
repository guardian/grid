package controllers

import play.api.mvc.{Result, Action, Controller}
import play.api.libs.concurrent.Execution.Implicits._
import lib.{Config, ThrallMessageConsumer, ElasticSearch}
import com.gu.mediaservice.syntax._

object HealthCheck extends Controller {

  def healthCheck = Action.async {
    elasticHealth map {
      case r: Result => sqsHealth
      case _ => ServiceUnavailable("ES is not healthy")
    }
  }

  def elasticHealth = {
    ElasticSearch.client.prepareSearch().setSize(0)
      .executeAndLog("Health check")
      .filter(_ => ! ThrallMessageConsumer.actorSystem.isTerminated)
      .map(_ => Ok("ES is healthy"))
  }

  def sqsHealth = {
    val timeLastMessage = ThrallMessageConsumer.timeMessageLastProcessed.get

    if (timeLastMessage.plusMinutes(Config.healthyMessageRate).isBeforeNow)
      ServiceUnavailable(s"Not received a message since $timeLastMessage")
    else
      Ok("SQS is healthy")
  }
}
