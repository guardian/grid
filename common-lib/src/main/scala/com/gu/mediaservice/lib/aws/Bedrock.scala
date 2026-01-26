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

sealed trait InputType {
  def value: String
}
object InputType {
  case object Image extends InputType {
    val value = "image"
  }
  case object SearchDocument extends InputType {
    val value = "search_document"
  }
}

object Bedrock {
  private case class BedrockImageRequest(
   input_type: String,
   embedding_types: List[String],
   images: List[String]
 )
  private case class BedrockTextRequest(
    input_type: String,
    embedding_types: List[String],
    texts: List[String]
  )

  private implicit val bedrockImageRequestFormat: OFormat[BedrockImageRequest] = Json.format[BedrockImageRequest]
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

  private def createRequestBody(inputType: InputType, inputData: List[String]): InvokeModelRequest = {

    val jsonBody = inputType match {
      case InputType.Image =>
        val body = Bedrock.BedrockImageRequest(
          input_type = inputType.value,
          embedding_types = List("float"),
          images = inputData
        )
        Json.toJson(body).toString()
      case InputType.SearchDocument =>
        val body = Bedrock.BedrockTextRequest(
          input_type = inputType.value,
          embedding_types = List("float"),
          texts = inputData
        )
        Json.toJson(body).toString()
    }

    val request: InvokeModelRequest = {
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

  def createEmbedding(inputType: InputType, inputData: String)(implicit ec: ExecutionContext, logMarker: LogMarker): Future[List[Float]] = {
    val requestBody = createRequestBody(inputType, List(inputData))
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

  def createSearchTermEmbedding(q: String)(implicit ec: ExecutionContext, logMarker: LogMarker): Future[List[Float]] = {
    logger.info(logMarker, s"Creating embedding for search term: $q")

    val body = Bedrock.BedrockTextRequest(
      input_type = "search_document",
      embedding_types = List("float"),
      texts = List(q)
    )
    val jsonBody = Json.toJson(body).toString()

    val requestBody: InvokeModelRequest = {
      InvokeModelRequest
        .builder()
        .accept("*/*")
        .body(SdkBytes.fromUtf8String(jsonBody))
        .contentType("application/json")
        .modelId("cohere.embed-english-v3")
        .build()
    }

    val bedrockFuture = Future {
      sendBedrockEmbeddingRequest(requestBody)
    }
    bedrockFuture.map { response =>
      val responseBody = response.body().asUtf8String()
      val json = Json.parse(responseBody)
      // Extract the embedding array (first element since it's an array of arrays)
      val embedding = (json \ "embeddings" \ "float")(0).as[List[Float]]
      logger.info(
        logMarker,
        s"Successfully extracted search term embedding. Vector size: ${embedding.size}"
      )
      embedding
    }
  }
}
