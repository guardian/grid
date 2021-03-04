package com.gu.mediaservice


import java.util.concurrent.TimeUnit

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.events.{APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent}
import com.gu.mediaservice.lib.auth.provider.ApiKeyAuthentication
import com.gu.mediaservice.model.Image
import com.typesafe.scalalogging.LazyLogging
import play.api.libs.json.Json

import scala.collection.JavaConverters._
import play.api.libs.ws.ahc.AhcWSClient

import scala.concurrent.ExecutionContext.Implicits.global
import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import play.api.libs.ws._

import scala.concurrent.Await
import scala.concurrent.duration.{Duration, FiniteDuration}

class ImageProjectionLambdaHandler extends ApiKeyAuthentication with LazyLogging {

  private val apiCheckTimeoutInSeconds = 10
  val apiCheckTimeout = new FiniteDuration(1, TimeUnit.SECONDS)

  implicit private val system = ActorSystem()
  implicit private val materializer = ActorMaterializer()
  implicit private val ws:WSClient  = AhcWSClient()

  def handleRequest(event: APIGatewayProxyRequestEvent, context: Context): APIGatewayProxyResponseEvent = {

    logger.info(s"handleImageProjection event: $event")

    val mediaId = event.getPath.stripPrefix("/images/projection/")

    val domainRoot = sys.env("DOMAIN_ROOT")
    // if we want to release the load from main grid image-loader we can pass a dedicated endpoint
    val imageLoaderEndpoint = sys.env.get("IMAGE_LOADER_ENDPOINT")
    val headers = event.getHeaders.asScala.toMap

    val apiKey = getAuthKeyFrom(headers)

    apiKey match {
      case Some(key) =>
        val cfg: ImageDataMergerConfig = ImageDataMergerConfig(apiKey = key, domainRoot = domainRoot, imageLoaderEndpointOpt = imageLoaderEndpoint)
        val merger = new ImageDataMerger(cfg)

        val ok = Await.result(merger.isValidApiKey, apiCheckTimeout)
        if (!ok) {
          getUnauthorisedResponse
        } else {
          handleImageProjection(mediaId, cfg, merger)
        }
      case _ => getUnauthorisedResponse
    }
  }

  private def handleImageProjection(mediaId: String, cfg: ImageDataMergerConfig, merger: ImageDataMerger) = {
    logger.info(s"starting handleImageProjection for mediaId=$mediaId")
    logger.info(s"with config: $cfg")

    val result: FullImageProjectionResult = merger.getMergedImageData(mediaId.asInstanceOf[String])
    result match {
      case FullImageProjectionSuccess(mayBeImage) =>
        mayBeImage match {
          case Some(img) =>
            getSuccessResponse(img)
          case _ =>
            getNotFoundResponse(mediaId)
        }
      case FullImageProjectionFailed(message, downstreamMessage) =>
        getErrorFoundResponse(message, downstreamMessage)
    }
  }

  private def getSuccessResponse(img: Image) = {
    logger.info(s"image projected \n $img")
    val body = Json.toJson(img).toString
    new APIGatewayProxyResponseEvent()
      .withStatusCode(200)
      .withHeaders(Map("content-type" -> "application/json").asJava)
      .withBody(body)
  }

  private def getNotFoundResponse(mediaId: String) = {
    val emptyRes = Json.obj("message" -> s"image with id=$mediaId not-found").toString
    logger.info(s"image not projected \n $emptyRes")
    new APIGatewayProxyResponseEvent()
      .withStatusCode(404)
      .withHeaders(Map("content-type" -> "application/json").asJava)
      .withBody(emptyRes)
  }

  private def getErrorFoundResponse(message: String, downstreamMessage: String) = {
    val res = Json.obj("message" -> Json.obj(
      "errorMessage" -> message,
      "downstreamErrorMessage" -> downstreamMessage
    )).toString

    logger.info(s"image not projected due to error \n $res")

    new APIGatewayProxyResponseEvent()
      .withStatusCode(500)
      .withHeaders(Map("content-type" -> "application/json").asJava)
      .withBody(res)
  }

  private def getUnauthorisedResponse = {
    val res = Json.obj("message" -> s"missing or invalid api key header").toString

    new APIGatewayProxyResponseEvent()
      .withStatusCode(401)
      .withHeaders(Map("content-type" -> "application/json").asJava)
      .withBody(res)
  }

  private def getAuthKeyFrom(headers: Map[String, String]) = {
    // clients like curl or API gateway may lowerCases custom header names, yay!
    headers.find {
      case (k, _) => k.equalsIgnoreCase(apiKeyHeaderName)
    }.map(_._2)
  }
}
