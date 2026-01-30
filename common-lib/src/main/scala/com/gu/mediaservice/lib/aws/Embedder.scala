package com.gu.mediaservice.lib.aws
import com.amazonaws.services.sqs.model.SendMessageResult
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.{Jpeg, MimeType, Png, Tiff}
import play.api.libs.json.{Json, OFormat}
import software.amazon.awssdk.services.s3vectors.model.QueryVectorsResponse

import java.nio.file.{Files, Path}
import scala.concurrent.{ExecutionContext, Future}

sealed trait CohereCompatibleMimeType
case object CohereJpeg extends CohereCompatibleMimeType
case object CoherePng extends CohereCompatibleMimeType

case class EmbedderMessage(imageId: String, fileType: String, s3Bucket: String, s3Key: String)

object EmbedderMessage {
  implicit val format: OFormat[EmbedderMessage] = Json.format[EmbedderMessage]
}

class Embedder(s3vectors: S3Vectors, bedrock: Bedrock, sqs: SimpleSqsMessageConsumer)(implicit ec: ExecutionContext) extends GridLogging {

  def createEmbeddingAndSearch(query: String)(implicit logMarker: LogMarker): Future[QueryVectorsResponse] = {
    logger.info(logMarker, s"Searching for image embedding for query: $query")
    val embeddingFuture = bedrock.createEmbedding(InputType.SearchDocument, query)
    embeddingFuture.flatMap { embedding =>
      s3vectors.searchVectorStore(embedding, query)
    }
  }

  def queueImageToEmbed(message: EmbedderMessage)(implicit logMarker: LogMarker) = {
    val messageBody = Json.stringify(Json.toJson(message))
    val result: SendMessageResult = sqs.sendMessage(messageBody)
    logger.info(logMarker, s"Queued image for embedding with message ID: ${result.getMessageId}")
  }
}
