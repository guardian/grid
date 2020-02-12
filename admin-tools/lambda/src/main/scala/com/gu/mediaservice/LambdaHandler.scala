package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.events.{APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent}
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import com.gu.mediaservice.model.Image
import play.api.libs.json.Json

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.Duration
import scala.concurrent.{Await, Future}

class LambdaHandler {

  def handleImageProjection(event: APIGatewayProxyRequestEvent, context: Context): APIGatewayProxyResponseEvent = {

    println(s"handleImageProjection event: $event")

    val mediaId = event.getPath.stripPrefix("/images/projection/")

    val domainRoot = sys.env("DOMAIN_ROOT")
    val headers = event.getHeaders.asScala.toMap

    val apiKey = getAuthKeyFrom(headers)

    val gridClient = GridClient(5)

    apiKey match {
      case Some(key) =>
        val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)

        val cfg: ImageDataMergerConfig = ImageDataMergerConfig(key, services, gridClient)
        if (!cfg.isValidApiKey()) return getUnauthorisedResponse

        println(s"starting handleImageProjection for mediaId=$mediaId")
        println(s"with config: $cfg")

        val merger = new ImageDataMerger(cfg, gridClient)
        val maybeImageFuture: Future[Option[Image]] = merger.getMergedImageData(mediaId.asInstanceOf[String])
        val mayBeImage: Option[Image] = Await.result(maybeImageFuture, Duration.Inf)

        mayBeImage match {
          case Some(img) =>
            println(s"image projected \n $img")
            getSuccessResponse(img)
          case _ =>
            getNotFoundResponse(mediaId)
        }
      case _ => getUnauthorisedResponse
    }
  }

  private def getSuccessResponse(img: Image) = {
    val body = Json.toJson(img).toString
    new APIGatewayProxyResponseEvent()
      .withStatusCode(200)
      .withHeaders(Map("content-type" -> "application/json").asJava)
      .withBody(body)
  }

  private def getNotFoundResponse(mediaId: String) = {
    val emptyRes = Json.obj("message" -> s"image with id=$mediaId not-found").toString
    println(s"image not projected \n $emptyRes")
    new APIGatewayProxyResponseEvent()
      .withStatusCode(404)
      .withHeaders(Map("content-type" -> "application/json").asJava)
      .withBody(emptyRes)
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
      case (k, _) => k.equalsIgnoreCase(Authentication.apiKeyHeaderName)
    }.map(_._2)
  }
}
