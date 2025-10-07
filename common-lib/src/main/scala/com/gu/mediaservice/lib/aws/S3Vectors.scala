package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.LogMarker
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

  override def awsRegionV2: Region = Region.EU_CENTRAL_1

  val client: S3VectorsClient = {
    logger.info("Creating Bedrock client")
    withAWSCredentialsV2(S3VectorsClient.builder())
      .build()
  }

  private def createRequestBody(embedding: List[Float], imageId: String): PutVectorsRequest = {
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
      .indexName("cohere-embed-english-v3")
      .vectorBucketName(s"image-embeddings-${config.stage.toLowerCase}")
      .vectors(inputVector)
      .build()

    request
  }

  def putVector(base64EncodedImage: String, imageId: String)(implicit ec: ExecutionContext, logMarker: LogMarker
  ): Future[PutVectorsResponse] = {
    logger.info("Starting putVector")

    try {
      val bedrock = new Bedrock(config)
      logger.info("Created bedrock class")
      logger.info("image string: ", base64EncodedImage)
      val embedding = bedrock.createImageEmbedding(base64EncodedImage)
      logger.info("Created embedding, ", embedding)
      logger.info("Now we're going to call the putVectors function...")
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
