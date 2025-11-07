package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.LogMarker
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3vectors._
import software.amazon.awssdk.services.s3vectors.model.{DeleteVectorsRequest, PutInputVector, PutVectorsRequest, PutVectorsResponse, S3VectorsRequest, VectorData}

import java.net.URI
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters._

class S3Vectors(config: CommonConfig)
  extends AwsClientV2BuilderUtils {

  // TODO: figure out what the more usual pattern for turning off localstack behaviour is
  override def awsLocalEndpointUri: Option[URI] = None

  override def isDev: Boolean = config.isDev

  // The S3 Vector Store is not yet available in eu-west-1, so we are using eu-central-1 because it's closest to us.
  override def awsRegionV2: Region = Region.EU_CENTRAL_1

  val client: S3VectorsClient = {
    withAWSCredentialsV2(S3VectorsClient.builder())
      .build()
  }

  val vectorBucketName: String = s"image-embeddings-${config.stage.toLowerCase}"
  val indexName: String = "cohere-embed-english-v3"

  private def createPutVectorsRequest(embedding: List[Float], imageId: String): PutVectorsRequest = {
    val vectorData: VectorData = VectorData
      .builder()
      .float32(embedding.map(float2Float).asJava)
      .build()

    val inputVector: PutInputVector = PutInputVector
      .builder()
      .data(vectorData)
      .key(imageId)
      .build()

    val request: PutVectorsRequest = PutVectorsRequest
      .builder()
      .indexName(indexName)
      .vectorBucketName(vectorBucketName)
      .vectors(inputVector)
      .build()

    request
  }

  // TODO make this a future too
  def storeEmbedding(bedrockEmbedding: List[Float], imageId: String)(implicit logMarker: LogMarker): PutVectorsResponse = {
    try {
      val request = createPutVectorsRequest(bedrockEmbedding, imageId)
      val response = client.putVectors(request)
      logger.info(
        logMarker,
        s"S3 Vector Store API call to store image embedding completed with status: ${response.sdkHttpResponse().statusCode()}"
      )
      response
    } catch {
      case e: Exception =>
        // TODO: do we need logging here or will we catch and log higher up?
        // TODO: also, the `cause` param doesn't get interpolated into the message like in a JS console.error call, so remove the colon
        logger.error(logMarker, s"Exception during S3 Vector Store API call to store image embedding for $imageId: ", e)
        throw e
    }
  }

  // TO DO:
  // - [ ] max vectors is 500, need to batch
  // - what happens if I delete vectors that are not there? Nothing, you just a 200!
  // - in the reaper for comprehension, what happens if a previous operation fails? The whole thing fails!
  // - [ ] "Write requests per second per vector index: Up to 5" https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-limitations.html
  // are both DeleteVectors and PutVectors considered writes?
  def deleteEmbeddings(imageIds: Set[String])(
    implicit logMarker: LogMarker,
    executionContext: ExecutionContext
  ): Future[Unit] = Future {
    try {
      val request = DeleteVectorsRequest.builder()
        .indexName(indexName)
        .vectorBucketName(vectorBucketName)
        .keys(imageIds.asJavaCollection)
        .build()

      // Currently AWS don't provide any information on which deletes succeeded or failed.
      // (It returns 200 even if none of the provided keys currently exist.)
      // We could figure this out, but it would require making GetVectors requests
      // before & after (and GetVectors has a lower max of 100 keys at once).
      client.deleteVectors(request)
    } catch {
      case e: Exception =>
        // TODO question: do we need logging here or is it fine to let it log higher up?
        // TODO: show some of the imageIds in the log message
        logger.error(logMarker, s"Failed to delete embeddings", e)
    }
  }
}
