package com.gu.mediaservice.lib.aws

import software.amazon.awssdk.services.bedrockruntime.model._
import software.amazon.awssdk.services.bedrockruntime._
import com.gu.mediaservice.lib.config.CommonConfig

import java.util.concurrent.CompletableFuture
import play.api.libs.json.Json
import software.amazon.awssdk.core.SdkBytes

import java.net.URI
import com.gu.mediaservice.lib.logging.LogMarker
import play.api.libs.json.Format.GenericFormat
import play.api.libs.json.OFormat.oFormatFromReadsAndOWrites
import play.api.libs.json._

object Bedrock {
  private case class BedrockRequest(
   input_type: String,
   embedding_types: List[String],
   images: List[String]
 )
  private implicit val bedrockRequestFormat: OFormat[BedrockRequest] = Json.format[BedrockRequest]
}

import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.FutureConverters.CompletionStageOps

class Bedrock(config: CommonConfig)
  extends AwsClientV2BuilderUtils {

  // TODO: figure out what the more usual pattern for turning off localstack behaviour is
  override def awsLocalEndpointUri: Option[URI] = None

  override def isDev: Boolean = config.isDev

  val client: BedrockRuntimeAsyncClient = {
    logger.info("Creating Bedrock client")
    withAWSCredentialsV2(BedrockRuntimeAsyncClient.builder())
      .build()
  }

  private def createRequestBody(base64EncodedImage: String): InvokeModelRequest = {
    logger.info("Creating request body")
    val body = Bedrock.BedrockRequest(
      input_type = "image",
      embedding_types = List("float"),
      images = List(s"data:image/jpg;base64,$base64EncodedImage")
    )
    val jsonBody = Json.toJson(body).toString()
    logger.info(s"Request body created, length: ${jsonBody.length}")

    val request: InvokeModelRequest = {
      logger.info("Building request")
      InvokeModelRequest
        .builder()
        .accept("*/*")
        .body(SdkBytes.fromUtf8String(jsonBody))
        .contentType("application/json")
        .modelId("cohere.embed-english-v3")
        .build()
    }
    request
  }

  private def sendBedrockEmbeddingRequest(base64EncodedImage: String)(
    implicit logMarker: LogMarker
  ): CompletableFuture[InvokeModelResponse] = {
    logger.info(logMarker, "Starting fetchEmbedding call")
    try {
      val future = client.invokeModel(createRequestBody(base64EncodedImage))
      logger.info(logMarker, "Bedrock API call initiated")
      future.whenComplete((response, error) => {
        if (error != null) {
          logger.error(logMarker, "Bedrock API call failed", error)
        } else {
          logger.info(
            logMarker,
            s"Bedrock API call completed with status: ${response.sdkHttpResponse().statusCode()}"
          )
        }
      })
      future
    } catch {
      case e: Exception =>
        logger.error(logMarker, "Exception during Bedrock API call", e)
        throw e
    }
  }

  def createImageEmbedding(base64EncodedImage: String)(implicit ec: ExecutionContext, logMarker: LogMarker): Future[List[Float]] = {
    logger.info(
      logMarker,
      s"Starting image embedding creation"
    )
    val bedrockFuture = sendBedrockEmbeddingRequest(base64EncodedImage)

    bedrockFuture.asScala
      .map { response =>
        logger.info(
          logMarker,
          s"Received Bedrock response. Status: ${response.sdkHttpResponse().statusCode()}"
        )
        // Now we can safely access response.body()
        val responseBody = response.body().asUtf8String()
        logger.info(logMarker, s"Response body: $responseBody")
        val json = Json.parse(responseBody)
        logger.info(logMarker, s"Parsed JSON response: $json")
        // Extract the embeddings array (first element since it's an array of arrays)
        val embeddings = (json \ "embeddings" \ "float")(0).as[List[Float]]
        logger.info(
          logMarker,
          s"Successfully extracted embeddings. Vector size: ${embeddings.size}"
        )
        embeddings
      }
  }
}
