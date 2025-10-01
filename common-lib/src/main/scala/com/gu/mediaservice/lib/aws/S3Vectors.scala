package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.LogMarker
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

  val client: S3VectorsClient = {
    logger.info("Creating Bedrock client")
    withAWSCredentialsV2(S3VectorsClient.builder())
      .build()
  }

  private def createRequestBody(embedding: List[Float], imageId: String) = {
    logger.info("Creating request body")

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
      .indexName("cohereEmbedEnglishV3")
      .vectorBucketName(s"image-embeddings-${config.stage}")
      .vectors(inputVector)
      .build()

    request
  }

  def putVector(base64EncodedImage: String, imageId: String)(implicit ec: ExecutionContext, logMarker: LogMarker
  ): Future[PutVectorsResponse] = {
    logger.info("Starting embedding call")

    try {

      val bedrock = new Bedrock(config)

      val embedding = bedrock.createImageEmbedding(base64EncodedImage)

      val vectorInput = embedding.map { data =>
        client.putVectors(createRequestBody(data, imageId))
      }

      vectorInput
    } catch {
      case e: Exception =>
        logger.error(logMarker, "Exception during Bedrock API call", e)
        throw e
    }
  }
//  private def searchS3VectorStore() = {}
}
