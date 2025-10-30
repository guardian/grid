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

object Bedrock {
  private case class BedrockRequest(
   input_type: String,
   embedding_types: List[String],
   images: List[String]
 )
  private implicit val bedrockRequestFormat: OFormat[BedrockRequest] = Json.format[BedrockRequest]
}

import scala.concurrent.{ExecutionContext, Future}

class Bedrock(config: CommonConfig)
  extends AwsClientV2BuilderUtils {

  // TODO: figure out what the more usual pattern for turning off localstack behaviour is
  override def awsLocalEndpointUri: Option[URI] = None

  override def isDev: Boolean = config.isDev

  val client: BedrockRuntimeClient = {
    withAWSCredentialsV2(BedrockRuntimeClient.builder())
      .build()
  }

  private def createRequestBody(base64EncodedImage: String, fileType: CohereCompatibleMimeType): InvokeModelRequest = {
    val images = fileType match {
        case CohereJpeg =>  List(s"data:image/jpg;base64,$base64EncodedImage")
        case CoherePng => List(s"data:image/png;base64,$base64EncodedImage")
    }

    val body = Bedrock.BedrockRequest(
      input_type = "image",
      embedding_types = List("float"),
      images = images
    )
    val jsonBody = Json.toJson(body).toString()

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

  private def sendBedrockEmbeddingRequest(base64EncodedImage: String, fileType: CohereCompatibleMimeType)(
    implicit logMarker: LogMarker
  ): InvokeModelResponse = {
    try {
      val response = client.invokeModel(createRequestBody(base64EncodedImage, fileType))
      logger.info(
        logMarker,
        s"Bedrock API call completed with status: ${response.sdkHttpResponse().statusCode()}"
      )
      response
    }
    catch {
      case e: Exception =>
        logger.error(logMarker, "Exception during Bedrock API call", e)
        throw e
    }
  }

  def createImageEmbedding(base64EncodedImage: String, fileType: CohereCompatibleMimeType)(implicit ec: ExecutionContext, logMarker: LogMarker): Future[List[Float]] = {
    val bedrockFuture = Future { sendBedrockEmbeddingRequest(base64EncodedImage, fileType) }
    bedrockFuture.map { response =>
      val responseBody = response.body().asUtf8String()
      val json = Json.parse(responseBody)
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
