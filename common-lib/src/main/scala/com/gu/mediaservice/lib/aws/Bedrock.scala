package com.gu.mediaservice.lib.aws

import software.amazon.awssdk.services.bedrockruntime.model._
import software.amazon.awssdk.services.bedrockruntime._
import com.amazonaws.auth.AWSCredentialsProvider
import com.gu.mediaservice.lib.config.CommonConfig
import java.util.concurrent.CompletableFuture
import play.api.libs.json.Json
import software.amazon.awssdk.core.SdkBytes
import java.net.URI
import com.gu.mediaservice.lib.logging.LogMarker

class Bedrock(imageBase64: String) extends AwsClientV2BuilderUtils {

  override def awsLocalEndpointUri: Option[URI] = ???

  override def isDev: Boolean = ???

  val client =
    withAWSCredentialsV2(BedrockRuntimeAsyncClient.builder())
      .build()

  private def createRequestBody(
      images: List[String]
  ): String = {

    val body = Map(
      "input_type" -> "image",
      "embedding_types" -> "float",
      "images" -> s"data:image/jpg;base64,$images"
    )

    Json.toJson(body).toString()
  }

  val request: InvokeModelRequest =
    InvokeModelRequest
      .builder()
      .accept("*/*")
      .body(SdkBytes.fromUtf8String(createRequestBody(List(imageBase64))))
      .contentType("application/json")
      .modelId("cohere.embed-english-v3")
      .build()

  def fetchEmbedding()(implicit
      logMarker: LogMarker
  ): CompletableFuture[InvokeModelResponse] = {
    logger.info(logMarker, s"Going to fetch embedding now")
    client.invokeModel(request)
  }

}
