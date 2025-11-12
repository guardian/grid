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

  private def getVectors(keys: Set[String], phase: String)(implicit logMarker: LogMarker): List[GetOutputVector] = {
    val startTime = System.currentTimeMillis()
    // GetVectors has a max of 100
    // https://docs.aws.amazon.com/AmazonS3/latest/API/API_S3VectorBuckets_GetVectors.html
    val result = keys.grouped(100).flatMap { batch =>
      val request = GetVectorsRequest.builder()
        .indexName(indexName)
        .vectorBucketName(vectorBucketName)
        .keys(batch.asJavaCollection)
        .build()

      val response = client.getVectors(request)
      response.vectors().asScala.toList
    }.toList
    val duration = System.currentTimeMillis() - startTime
    logger.info(logMarker, s"[debug] getVectors ($phase) for ${keys.size} keys returned ${result.size} vectors [took ${duration}ms]")
    result
  }

  private def deleteVectors(keys: Set[String])(implicit logMarker: LogMarker) = {
    val startTime = System.currentTimeMillis()
    val request = DeleteVectorsRequest.builder()
      .indexName(indexName)
      .vectorBucketName(vectorBucketName)
      .keys(keys.asJavaCollection)
      .build()

    val response = client.deleteVectors(request)
    val duration = System.currentTimeMillis() - startTime
    logger.info(logMarker, s"[debug] deleteVectors for ${keys.size} keys took ${duration}ms")
    response
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
        logger.error(logMarker, s"Exception during S3 Vector Store API call to store image embedding for $imageId", e)
        throw e
    }
  }

  def deleteEmbeddings(imageIds: Set[String])(implicit logMarker: LogMarker): Future[Map[String, DeletionStatus.Value]] = Future {
    val overallStartTime = System.currentTimeMillis()
    // We can only delete 500 keys at once
    // https://docs.aws.amazon.com/AmazonS3/latest/API/API_S3VectorBuckets_DeleteVectors.html
    val batches = imageIds.grouped(500).toList
    val result = batches.zipWithIndex.flatMap { case (batch, i) =>
      val batchStartTime = System.currentTimeMillis()
      val batchLogging = s"batch ${i+1} of ${batches.length}"
      try {
        // Currently AWS don't provide any information on which deletes succeeded or failed.
        // It returns 200 even if none of the provided keys currently exist.
        // So in order to tell what was actually deleted, we need to make GetVectors requests before & after.
        val vectorsBefore = getVectors(batch, "before").map(_.key).toSet

        val batchResult = if (vectorsBefore.isEmpty) {
          logger.info(logMarker, s"[debug] 0 vectors to delete from batch of ${batch.size} ($batchLogging)")
          batch.map(key => key -> DeletionStatus.notFound)
        } else {
          logger.info(logMarker, s"[debug] Deleting ${vectorsBefore.size} vectors from batch of ${batch.size} ($batchLogging)")
          deleteVectors(batch)

          val vectorsAfter = getVectors(batch, "after").map(_.key).toSet
          if (vectorsAfter.nonEmpty) {
            logger.warn(logMarker, s"[debug] ${vectorsAfter.size} of ${vectorsBefore.size} failed to delete ($batchLogging)")
          }
          logger.info(logMarker, s"[debug] ${vectorsBefore.size - vectorsAfter.size} vectors deleted from batch of ${batch.size} ($batchLogging)")

          batch.map(key => key -> {
            if (!vectorsBefore.contains(key)) DeletionStatus.notFound
            else if (vectorsAfter.contains(key)) DeletionStatus.notDeleted
            else DeletionStatus.deleted
          })
        }

        val batchDuration = System.currentTimeMillis() - batchStartTime
        val deleted = batchResult.count(_._2 == DeletionStatus.deleted)
        val notFound = batchResult.count(_._2 == DeletionStatus.notFound)
        val notDeleted = batchResult.count(_._2 == DeletionStatus.notDeleted)
        logger.info(logMarker, s"[debug] Batch ${i+1} of ${batches.length} completed [took ${batchDuration}ms]. Batch size: ${batch.size}, deleted: ${deleted}, not found: ${notFound}, not deleted: ${notDeleted}")
        batchResult
      } catch {
        case e: Exception =>
          logger.error(logMarker, s"[debug] Failed to delete a batch of ${batch.size} vectors ($batchLogging)", e)
          throw e
      }
    }.toMap
    val overallDuration = System.currentTimeMillis() - overallStartTime
    logger.info(logMarker, s"[debug] deleteEmbeddings completed for ${imageIds.size} imageIds in ${overallDuration}ms")
    result
  }
}
