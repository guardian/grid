package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.events.{APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent}
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.model.Image
import com.typesafe.scalalogging.LazyLogging
import play.api.libs.json.Json

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global
import scala.util.Try

class ImageProjectionLambdaHandler extends LazyLogging {
  private val domainRoot = sys.env("DOMAIN_ROOT")
  private val streamName = sys.env("KINESIS_STREAM")
  // if we want to release the load from main grid image-loader we can pass a dedicated endpoint
  private val imageLoaderEndpoint = sys.env.get("IMAGE_LOADER_ENDPOINT")

  def handleRequest(event: APIGatewayProxyRequestEvent, context: Context): APIGatewayProxyResponseEvent = {
    val mediaId = event.getPath.stripPrefix("/images/projection/")
    val shouldReingest = if (event.getQueryStringParameters != null) {
      val shouldReingestStr = event.getQueryStringParameters.getOrDefault("reingest", "false")
      Try(shouldReingestStr.toBoolean).getOrElse(false)
    } else false

    getConfigFromRequestEvent(event) match {
      case Some(config) => projectImage(mediaId, config, reingest = shouldReingest)
      case None => getUnauthorisedResponse
    }
  }

  private def getConfigFromRequestEvent(event: APIGatewayProxyRequestEvent): Option[ImageDataMergerConfig] = {
    val headers = event.getHeaders.asScala.toMap
    val maybeApiKey = getAuthKeyFrom(headers)

    maybeApiKey.flatMap { apiKey =>
      val config = ImageDataMergerConfig(apiKey, domainRoot, imageLoaderEndpoint)
      if (config.isValidApiKey()) Some(config) else None
    }
  }

  private def projectImage(mediaId: String, config: ImageDataMergerConfig, reingest: Boolean) = {
    logger.info(s"starting handleImageProjection for mediaId=$mediaId, reingest=$reingest")
    logger.info(s"with config: $config")

    val merger = new ImageDataMerger(config)
    val result: FullImageProjectionResult = merger.getMergedImageData(mediaId.asInstanceOf[String])
    result match {
      case FullImageProjectionSuccess(mayBeImage) =>
        mayBeImage match {
          case Some(img) =>
            if (reingest) { putToKinesis(img, streamName) }
            getSuccessResponse(img)
          case _ =>
            getNotFoundResponse(mediaId)
        }
      case FullImageProjectionFailed(message, downstreamMessage) =>
        getErrorFoundResponse(message, downstreamMessage)
    }
  }

  private def putToKinesis(image: Image, streamName: String): Unit = {
    logger.info(s"Enqueueing reingest message for image ${image.id}")
    val kinesisClient = AwsHelpers.buildKinesisClient()
    val message = UpdateMessage(subject = "reingest-image", image = Some(image))
    AwsHelpers.putToKinesis(message, streamName, kinesisClient)
    logger.info(s"Reingest message for image ${image.id} enqueued")
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
      case (k, _) => k.equalsIgnoreCase(Authentication.apiKeyHeaderName)
    }.map(_._2)
  }
}
