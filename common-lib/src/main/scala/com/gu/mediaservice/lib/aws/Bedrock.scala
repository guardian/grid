package com.gu.mediaservice.lib.aws

import software.amazon.awssdk.services.bedrockruntime.model._
import software.amazon.awssdk.services.bedrockruntime._
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.libs.json.Json
import software.amazon.awssdk.core.SdkBytes

import java.net.URI
import com.gu.mediaservice.lib.logging.LogMarker
import play.api.libs.json.OFormat.oFormatFromReadsAndOWrites
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

object Bedrock {
  private case class BedrockTextRequest(
    input_type: String,
    embedding_types: List[String],
    texts: List[String],
    output_dimension: Int
  )

  private implicit val bedrockTextRequestFormat: OFormat[BedrockTextRequest] = Json.format[BedrockTextRequest]
}

class Bedrock(config: CommonConfig)
  extends AwsClientV2BuilderUtils {

  // TODO: figure out what the more usual pattern for turning off localstack behaviour is
  override def awsLocalEndpointUri: Option[URI] = None

  override def isDev: Boolean = config.isDev

  val client: BedrockRuntimeClient = {
    withAWSCredentialsV2(BedrockRuntimeClient.builder())
      .build()
  }

  private def createRequestBody(inputData: String): InvokeModelRequest = {
    val body = Bedrock.BedrockTextRequest(
      input_type = "search_query",
      embedding_types = List("float"),
      texts = List(inputData),
      output_dimension = 256
    )
    val jsonBody = Json.toJson(body).toString()

    val request: InvokeModelRequest = {
      InvokeModelRequest
        .builder()
        .accept("*/*")
        .body(SdkBytes.fromUtf8String(jsonBody))
        .contentType("application/json")
        .modelId("global.cohere.embed-v4:0")
        .build()
    }
    request
  }

  private def sendBedrockEmbeddingRequest(requestBody: InvokeModelRequest)(
    implicit logMarker: LogMarker
  ): InvokeModelResponse = {
    try {
      val response = client.invokeModel(requestBody)
      logger.info(
        logMarker,
        s"Bedrock API call to create image embedding completed with status: ${response.sdkHttpResponse().statusCode()}"
      )
      response
    }
    catch {
      case e: Exception =>
        logger.error(logMarker, "Exception during Bedrock API call to create image embedding", e)
        throw e
    }
  }

  def createTextEmbedding(inputData: String)(implicit ec: ExecutionContext, logMarker: LogMarker): Future[List[Float]] = {
    val requestBody = createRequestBody(inputData)
    val bedrockFuture = Future { sendBedrockEmbeddingRequest(requestBody) }
    bedrockFuture.map { response =>
      val responseBody = response.body().asUtf8String()
      val json = Json.parse(responseBody)
      // Extract the embedding array (first element since it's an array of arrays)
      val embedding = (json \ "embeddings" \ "float")(0).as[List[Float]]
      logger.info(
        logMarker,
        s"Successfully extracted image embedding. Vector size: ${embedding.size}"
      )
      embedding
    }
  }
}
