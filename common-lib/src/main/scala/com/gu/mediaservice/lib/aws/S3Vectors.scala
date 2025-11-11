package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.LogMarker
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3vectors._
import software.amazon.awssdk.services.s3vectors.model.{DeleteVectorsRequest, GetOutputVector, GetVectorsRequest, PutInputVector, PutVectorsRequest, PutVectorsResponse, VectorData}

import java.net.URI
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters._

object S3Vectors {
  object DeletionStatus extends Enumeration {
    val deleted: Value = Value("deleted")
    val notFound: Value = Value("not found")
    val notDeleted: Value = Value("not deleted")
  }
}

class S3Vectors(config: CommonConfig)(implicit ec: ExecutionContext)
  extends AwsClientV2BuilderUtils {
  import S3Vectors.DeletionStatus

  // TODO: figure out what the more usual pattern for turning off localstack behaviour is
  override def awsLocalEndpointUri: Option[URI] = None

  override def isDev: Boolean = config.isDev

  // The S3 Vector Store is not yet available in eu-west-1, so we are using eu-central-1 because it's closest to us.
  override def awsRegionV2: Region = Region.EU_CENTRAL_1

  val client: S3VectorsClient = {
    withAWSCredentialsV2(S3VectorsClient.builder())
      .build()
  }

  private val vectorBucketName: String = s"image-embeddings-${config.stage.toLowerCase}"
  private val indexName: String = "cohere-embed-english-v3"

  private def getVectors(keys: Set[String]): List[GetOutputVector] =
    // GetVectors has a max of 100
    keys.grouped(100).flatMap { batch =>
      val request = GetVectorsRequest.builder()
        .indexName(indexName)
        .vectorBucketName(vectorBucketName)
        .keys(batch.asJavaCollection)
        .build()

      val response = client.getVectors(request)
      response.vectors().asScala.toList
    }.toList

  private def deleteVectors(keys: Set[String]) = {
    val request = DeleteVectorsRequest.builder()
      .indexName(indexName)
      .vectorBucketName(vectorBucketName)
      .keys(keys.asJavaCollection)
      .build()

    client.deleteVectors(request)
  }

  private def putVector(vector: List[Float], key: String): PutVectorsResponse = {
    val vectorData: VectorData = VectorData
      .builder()
      .float32(vector.map(float2Float).asJava)
      .build()

    val inputVector: PutInputVector = PutInputVector
      .builder()
      .data(vectorData)
      .key(key)
      .build()

    val request: PutVectorsRequest = PutVectorsRequest
      .builder()
      .indexName(indexName)
      .vectorBucketName(vectorBucketName)
      .vectors(inputVector)
      .build()

    client.putVectors(request)
  }

  def storeEmbedding(embedding: List[Float], imageId: String)(implicit logMarker: LogMarker): Future[Unit] = Future {
    try {
      val response = putVector(embedding, imageId)
      logger.info(
        logMarker,
        s"S3 Vector Store API call to store image embedding completed with status: ${response.sdkHttpResponse().statusCode()}"
      )
    } catch {
      case e: Exception =>
        // TODO: do we need logging here or will we catch and log higher up?
        // TODO: also, the `cause` param doesn't get interpolated into the message like in a JS console.error call, so remove the colon
        logger.error(logMarker, s"Exception during S3 Vector Store API call to store image embedding for $imageId: ", e)
        throw e
    }
  }

  def deleteEmbeddings(imageIds: Set[String])(implicit logMarker: LogMarker): Future[Map[String, DeletionStatus.Value]] = Future {
    // We can only delete 500 keys at once
    // https://docs.aws.amazon.com/AmazonS3/latest/API/API_S3VectorBuckets_DeleteVectors.html
    val batches = imageIds.grouped(500)
    batches.zipWithIndex.flatMap { case (batch, i) =>
      try {
        // Currently AWS don't provide any information on which deletes succeeded or failed.
        // It returns 200 even if none of the provided keys currently exist.
        // So in order to tell what was actually deleted, we need to make GetVectors requests before & after.
        val vectorsBefore = getVectors(batch)
        logger.info(logMarker, s"Deleting ${vectorsBefore.length} vectors from batch of ${batch.size} (batch $i of ${batches.length})")

        deleteVectors(batch)

        val vectorsAfter = getVectors(batch)
        if (vectorsAfter.nonEmpty) {
          logger.warn(s"${vectorsAfter.length} of ${vectorsBefore.length} failed to delete (batch $i of ${batches.length})")
        }
        logger.info(logMarker, s"${vectorsBefore.length - vectorsAfter.length} vectors deleted from batch of ${batch.size} (batch $i of ${batches.length})")

        batch.map(key => key -> {
          if (!vectorsBefore.contains(key)) DeletionStatus.notFound
          else if (vectorsAfter.contains(key)) DeletionStatus.notDeleted
          else DeletionStatus.deleted
        })
      } catch {
        case e: Exception =>
          logger.error(logMarker, s"Failed to delete a batch of ${batch.size} vectors (batch $i of ${batches.length})", e)
          throw e
      }
    }.toMap
  }
}
