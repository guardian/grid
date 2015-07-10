package controllers

import play.api.mvc.{Result, Action, Controller}
import play.api.libs.concurrent.Execution.Implicits._
import lib.{Config, MessageConsumer, ElasticSearch}
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
      .filter(_ => ! MessageConsumer.actorSystem.isTerminated)
      .map(_ => Ok("ES is healthy"))
  }

  def sqsHealth = {
    val lastHeartBeat = MessageConsumer.lastHeartBeat.get

    if (lastHeartBeat.plusMinutes(Config.heartRate).isBeforeNow)
      ServiceUnavailable(s"Heart has not beat since $lastHeartBeat")
    else
      Ok("SQS is healthy")
  }
}
