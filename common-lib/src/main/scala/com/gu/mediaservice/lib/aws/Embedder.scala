package com.gu.mediaservice.lib.aws
import com.amazonaws.services.sqs.model.SendMessageResult
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.{Jpeg, MimeType, Png, Tiff}
import software.amazon.awssdk.services.s3vectors.model.{QueryOutputVector, QueryVectorsResponse, VectorData}

import java.nio.file.{Files, Path}
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.CollectionHasAsScala

sealed trait CohereCompatibleMimeType
case object CohereJpeg extends CohereCompatibleMimeType
case object CoherePng extends CohereCompatibleMimeType

class Embedder(s3vectors: S3Vectors, bedrock: Bedrock, sqs: SimpleSqsMessageConsumer)(implicit ec: ExecutionContext) extends GridLogging {
  def mapCohereResponseToImageIds(response: QueryVectorsResponse): List[String] = {
    val results: java.util.List[QueryOutputVector] = response.vectors()
    results.asScala.map(_.key()).toList
  }

  def createEmbeddingAndSearch(query: String)(implicit logMarker: LogMarker): Future[List[String]] = {
    logger.info(logMarker, s"Searching for image embedding for query: $query")
    val embeddingFuture = bedrock.createEmbedding(InputType.SearchDocument, query)
    embeddingFuture.flatMap { embedding =>
      val futureResult = s3vectors.searchVectorStoreWithQueryString(embedding, query)
      futureResult.map { result =>
        mapCohereResponseToImageIds(result)
      }
    }
  }

  def imageToImageSearch(imageId: String)(implicit ec: ExecutionContext, logMarker: LogMarker): Future[List[String]] = {
    val maybeVector = s3vectors.findVectorForImageId(imageId)
    if (maybeVector.vectors().isEmpty) {
      logger.error(logMarker, s"No embedding found for ${imageId}")
      Future(Nil)
    } else {
      val vector: VectorData = maybeVector.vectors().asScala.head.data()
      val futureResult = s3vectors.searchVectorStoreForSimilarImages(vector)
      futureResult.map { result =>
        mapCohereResponseToImageIds(result)
      }
    }
  }
  def queueImageToEmbed(messageBody: String)(implicit logMarker: LogMarker) = {
    val message: SendMessageResult = sqs.sendMessage(messageBody)
    logger.info(logMarker, s"Queued image for embedding with message ID: ${message.getMessageId}")
  }
}
