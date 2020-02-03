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
  private def getUnauthorisedResponse = {
    val res = Json.obj("message" -> s"missing or invalid api key header").toString

    new APIGatewayProxyResponseEvent()
      .withStatusCode(401)
      .withHeaders(Map("content-type" -> "application/json").asJava)
      .withBody(res)
  }

  def handleImageProjection(event: APIGatewayProxyRequestEvent, context: Context): APIGatewayProxyResponseEvent = {

    println(s"handleImageProjection event: $event")

    val mediaId = event.getPath.stripPrefix("/images/projection/")

    val domainRoot = sys.env("DOMAIN_ROOT")
    val headers = event.getHeaders.asScala.toMap

    println(s"headers are $headers")

    // API Gateway lowercases header names, yay!
    val apiKey = headers.get(Authentication.apiKeyHeaderName.toLowerCase)

    apiKey match {
      case Some(key) => {
        println(s"api key is $apiKey")
        // DO work
        val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)

        val cfg: ImageDataMergerConfig = ImageDataMergerConfig(key, services)

        if(!cfg.isValidApiKey()) return getUnauthorisedResponse

        println(s"starting handleImageProjection for mediaId=$mediaId")
        println(s"with config: $cfg")

        val merger = new ImageDataMerger(cfg)

        val maybeImageFuture: Future[Option[Image]] = merger.getMergedImageData(mediaId.asInstanceOf[String])

        val mayBeImage: Option[Image] = Await.result(maybeImageFuture, Duration.Inf)

        mayBeImage match {
          case Some(img) =>
            println(s"image projected \n $img")
            val body = Json.toJson(img).toString
            new APIGatewayProxyResponseEvent()
              .withStatusCode(200)
              .withHeaders(Map("content-type" -> "application/json").asJava)
              .withBody(body)
          case _ =>
            val emptyRes = Json.obj("message" -> s"image with id=$mediaId not-found").toString
            println(s"image not projected \n $emptyRes")
            new APIGatewayProxyResponseEvent()
              .withStatusCode(404)
              .withHeaders(Map("content-type" -> "application/json").asJava)
              .withBody(emptyRes)
        }
      }
      case _ => getUnauthorisedResponse
    }
  }
}
