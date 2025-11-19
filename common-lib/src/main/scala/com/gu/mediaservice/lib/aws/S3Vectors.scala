package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.LogMarker
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3vectors._
import software.amazon.awssdk.services.s3vectors.model._

import java.net.URI
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters._


object S3Vectors {
  object DeletionStatus extends Enumeration {
    val deleted: Value = Value("deleted")
    val notFound: Value = Value("not found")
    val failed: Value = Value("failed to delete")

    def fromBeforeAndAfter(key: String, vectorsBefore: Set[String], vectorsAfter: Set[String]): DeletionStatus.Value =
      if (!vectorsBefore.contains(key)) DeletionStatus.notFound
      else if (vectorsAfter.contains(key)) DeletionStatus.failed
      else DeletionStatus.deleted
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

  private def getVectors(keys: Set[String], returnData: Boolean, returnMetadata: Boolean): List[GetOutputVector] =
    // GetVectors has a max of 100
    // https://docs.aws.amazon.com/AmazonS3/latest/API/API_S3VectorBuckets_GetVectors.html
    keys.grouped(100).flatMap { batch =>
      val request = GetVectorsRequest.builder()
        .indexName(indexName)
        .returnData(returnData)
        .returnMetadata(returnMetadata)
        .vectorBucketName(vectorBucketName)
        .keys(batch.asJavaCollection)
        .build()

      val response = client.getVectors(request)
      response.vectors().asScala.toList
    }.toList

  private def deleteVectors(keys: Set[String]): DeleteVectorsResponse = {
    val request = DeleteVectorsRequest.builder()
      .indexName(indexName)
      .vectorBucketName(vectorBucketName)
      .keys(keys.asJavaCollection)
      .build()

    client.deleteVectors(request)
  }

  private def convertEmbeddingToVectorData(embedding: List[Float]): VectorData = {
    VectorData
      .builder()
      .float32(embedding.map(float2Float).asJava)
      .build()
  }

  private def putVector(vector: List[Float], key: String): PutVectorsResponse = {
    val vectorData: VectorData = convertEmbeddingToVectorData(vector)

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

  private def queryVectors(embedding: List[Float]): QueryVectorsResponse = {
    val queryVector: VectorData = convertEmbeddingToVectorData(embedding: List[Float])

    val request: QueryVectorsRequest = QueryVectorsRequest
      .builder()
      .indexName(indexName)
      .vectorBucketName(vectorBucketName)
      .topK(30)
      .queryVector(queryVector)
      .build()

    client.queryVectors(request)
  }

  def searchVectorStore(queryEmbedding: List[Float], query: String)(implicit logMarker: LogMarker): Future[QueryVectorsResponse] = Future {
    try {
      val response = queryVectors(queryEmbedding)
      logger.info(
        logMarker,
        s"S3 Vector Store API call to search image embeddings completed with status: ${response.sdkHttpResponse().statusCode()}"
      )
      logger.info(logMarker, s"${response}")
      response
    } catch {
      case e: Exception =>
        logger.error(logMarker, s"Exception during S3 Vector Store API call for query ${query}", e)
        throw e
    }
  }

  private def getExistingVectorKeys(keys: Set[String]): Set[String] =
    getVectors(keys, returnData = false, returnMetadata = false).map(_.key).toSet

  private def deleteBatch(batch: Set[String], batchCount: String)(implicit logMarker: LogMarker): Map[String, DeletionStatus.Value] = {
    // Currently AWS don't provide any information on which deletes succeeded or failed.
    // It returns 200 even if none of the provided keys currently exist.
    // So in order to tell what was actually deleted, we need to make GetVectors requests before & after.
    val vectorsBefore = getExistingVectorKeys(batch)

    logger.info(logMarker, s"${vectorsBefore.size} vectors to delete from batch of ${batch.size} ($batchCount)")

    if (vectorsBefore.isEmpty) {
      batch.map(_ -> DeletionStatus.notFound).toMap
    } else {
      try {
        deleteVectors(batch)
      } catch {
        // Swallow this error. Because there is a low write throughput across Puts and Deletes
        // (5 per second), we may get failures here (though hopefully mitigated by the SDK retry logic).
        // By recovering at this granularity, we can still try and report exactly
        // what did and didn't get deleted through the subsequent GetVectors call.
        case e: Exception =>
          logger.error(logMarker, s"Exception during S3 Vector Store API call to delete batch of ${batch.size} vectors ($batchCount)", e)
      }
      val vectorsAfter = getExistingVectorKeys(batch)

      if (vectorsAfter.nonEmpty) {
        logger.warn(logMarker, s"${vectorsAfter.size} of ${vectorsBefore.size} failed to delete ($batchCount)")
      }
      logger.info(logMarker, s"${vectorsBefore.size - vectorsAfter.size} vectors deleted from batch of ${batch.size} ($batchCount)")

      batch.map(key => key -> DeletionStatus.fromBeforeAndAfter(key, vectorsBefore, vectorsAfter)).toMap
    }
  }

  def deleteEmbeddings(imageIds: Set[String])(implicit logMarker: LogMarker): Future[Map[String, DeletionStatus.Value]] = Future {
    try {
      val startTime = System.currentTimeMillis()
      // We can only delete 500 keys at once
      // https://docs.aws.amazon.com/AmazonS3/latest/API/API_S3VectorBuckets_DeleteVectors.html
      val batches = imageIds.grouped(500).toList

      val result = batches.zipWithIndex.flatMap { case (batch, i) =>
        val batchCount = s"batch ${i + 1} of ${batches.length}"
        deleteBatch(batch, batchCount)
      }.toMap

      val duration = System.currentTimeMillis() - startTime
      val stats = DeletionStatus.values.map { deletionStatus =>
        val count = result.values.count(_ == deletionStatus)
        s"${deletionStatus}: ${count}"
      }
      logger.info(
        logMarker,
        s"deleteEmbeddings took ${duration}ms for ${imageIds.size} images, ${stats.mkString(", ")}"
      )
      result
    } catch {
      case e: Exception =>
        // Swallow this error and assume all images failed to delete,
        // so we don't affect the rest of the reaping process and can still report the results.
        logger.error("Unexpected exception when deleting embeddings", e)
        imageIds.map(key => key -> DeletionStatus.failed).toMap
    }

  }
}
