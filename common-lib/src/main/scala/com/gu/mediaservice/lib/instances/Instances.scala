package com.gu.mediaservice.lib.instances

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model.Instance
import com.typesafe.scalalogging.StrictLogging
import play.api.libs.json.{Json, Reads}
import play.api.libs.ws.{WSClient, WSResponse}

import scala.concurrent.{ExecutionContext, Future}

trait Instances extends StrictLogging {
  def config: CommonConfig

  def wsClient: WSClient

  def getInstances()(implicit ec: ExecutionContext): Future[Seq[Instance]] = {
    wsClient.url(config.instancesEndpoint).get().map { r =>
      handleInstancesResponse(r)
    }
  }

  def getMyInstances(owner: String)(implicit ec: ExecutionContext): Future[Seq[Instance]] = {
    wsClient.url(config.myInstancesEndpoint).withQueryStringParameters("owner" -> owner).get().map { r =>
      handleInstancesResponse(r)
    }
  }

  private def handleInstancesResponse(r: WSResponse): Seq[Instance] = {
    r.status match {
      case 200 =>
        implicit val ir: Reads[Instance] = Json.reads[Instance]
        Json.parse(r.body).as[Seq[Instance]]
      case 404 =>
        logger.warn("Got 404 status for instances call; returning no permissions")
        Seq.empty
      case _ =>
        logger.error("Got non 200 status for instances call: " + r.status)
        throw new RuntimeException("Could not load instances")
    }
  }

}
