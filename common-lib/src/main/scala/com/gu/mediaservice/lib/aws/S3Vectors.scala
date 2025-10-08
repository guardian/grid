package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.LogMarker
import org.bouncycastle.util.encoders.Base64Encoder
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3vectors._
import software.amazon.awssdk.services.s3vectors.model.{PutInputVector, PutVectorsRequest, PutVectorsResponse, VectorData}

import java.net.URI
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters._

class S3Vectors(config: CommonConfig)
  extends AwsClientV2BuilderUtils {

  // TODO: figure out what the more usual pattern for turning off localstack behaviour is
  override def awsLocalEndpointUri: Option[URI] = None

  override def isDev: Boolean = config.isDev

//  The S3 Vector Store is not yet available in eu-west-1, so we are using eu-central-1 because it's closest to us.
  override def awsRegionV2: Region = Region.EU_CENTRAL_1

  val client: S3VectorsClient = {
    withAWSCredentialsV2(S3VectorsClient.builder())
      .build()
  }

  private def createRequestBody(embedding: List[Float], imageId: String): PutVectorsRequest = {
    val vectorData: VectorData = VectorData
      .builder()
      //      TODO find out if we can do something less upsetting than this float conversion
      .float32(embedding.map(_.asInstanceOf[java.lang.Float]).asJava)
      .build()

    val inputVector: PutInputVector = PutInputVector
      .builder()
      .data(vectorData)
      .key(imageId)
      .build()

    val request: PutVectorsRequest = PutVectorsRequest
      .builder()
      .indexName("cohere-embed-english-v3")
      .vectorBucketName(s"image-embeddings-${config.stage.toLowerCase}")
      .vectors(inputVector)
      .build()

    request
  }

  private def fetchEmbeddingFromBedrock(base64EncodedImage: String)(implicit ec: ExecutionContext, logMarker: LogMarker
  ): Future[List[Float]] = {
    val bedrock = new Bedrock(config)
    bedrock.createImageEmbedding(base64EncodedImage)
  }

  private def storeEmbeddingInS3VectorStore(bedrockEmbedding: List[Float], imageId: String)(implicit ec: ExecutionContext, logMarker: LogMarker
  ): PutVectorsResponse = {
    try {
      val input = createRequestBody(bedrockEmbedding, imageId)
      val response = client.putVectors(input)
      logger.info(
        logMarker,
        s"S3 Vector Store API call completed with status: ${response.sdkHttpResponse().statusCode()}"
      )
      response
    }
   catch {
    case e: Exception =>
      logger.error(logMarker, s"Exception during S3 Vector Store API call for ImageId $imageId: ", e)
      throw e
    }
  }

  def fetchEmbeddingAndStore(base64EncodedImage: String, imageId: String)(implicit ec: ExecutionContext, logMarker: LogMarker
  ): Future[PutVectorsResponse] = {
    val embeddingFuture = fetchEmbeddingFromBedrock(base64EncodedImage: String)
    val vectorInput = embeddingFuture.map { embedding =>
      storeEmbeddingInS3VectorStore(embedding, imageId)
    }
    vectorInput
  }

//  private def searchS3VectorStore() = {}
}
