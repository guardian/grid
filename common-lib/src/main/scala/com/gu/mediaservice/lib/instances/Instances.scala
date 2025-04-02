package com.gu.mediaservice.lib.instances

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model.Instance
import com.typesafe.scalalogging.StrictLogging
import play.api.libs.json.Json
import play.api.libs.ws.WSClient

import scala.concurrent.{ExecutionContext, Future}

trait Instances extends StrictLogging {
  def config: CommonConfig

  def wsClient: WSClient

  def getInstances()(implicit ec: ExecutionContext): Future[Seq[Instance]] = {
    wsClient.url(config.instancesEndpoint).get().map { r =>
      r.status match {
        case 200 =>
          implicit val ir = Json.reads[Instance]
          Json.parse(r.body).as[Seq[Instance]]
        case _ =>
          logger.warn("Got non 200 status for instances call: " + r.status)
          Seq.empty
      }
    }
  }

}
