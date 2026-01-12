package com.gu.mediaservice.lib.aws
import com.amazonaws.services.sqs.model.SendMessageResult
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.{Jpeg, MimeType, Png, Tiff}
import software.amazon.awssdk.services.s3vectors.model.QueryVectorsResponse

import java.nio.file.{Files, Path}
import java.util.Base64
import scala.concurrent.{ExecutionContext, Future}

sealed trait CohereCompatibleMimeType
case object CohereJpeg extends CohereCompatibleMimeType
case object CoherePng extends CohereCompatibleMimeType

class Embedder(s3vectors: S3Vectors, bedrock: Bedrock, sqs: SimpleSqsMessageConsumer)(implicit ec: ExecutionContext) extends GridLogging {
  // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v3.html#:~:text=The%20image%20must%20be%20in%20either%20image/jpeg%20or%20image/png%20format%20and%20has%20a%20maximum%20size%20of%205MB
  private def meetsCohereRequirements(fileType: MimeType, imageFilePath: Path): Either[String, CohereCompatibleMimeType]= {
    val fileSize = Files.size(imageFilePath)
    val fiveMB = 5_000_000

    fileType match {
      case _ if fileSize > fiveMB => Left(s"Image file is >5MB. File size: $fileSize")
      case Jpeg => Right(CohereJpeg)
      case Png => Right(CoherePng)
      case Tiff => Left("Image file type is not supported. File type: Tiff")
    }
  }

  def createEmbeddingAndSearch(query: String)(implicit logMarker: LogMarker): Future[QueryVectorsResponse] = {
    logger.info(logMarker, s"Searching for image embedding for query: $query")
    val embeddingFuture = bedrock.createEmbedding(InputType.SearchDocument, query)
    embeddingFuture.flatMap { embedding =>
      s3vectors.searchVectorStore(embedding, query)
    }
  }

  def queueImageToEmbed(messageBody: String)(implicit logMarker: LogMarker) = {
    val message: SendMessageResult = sqs.sendMessage(messageBody)
    logger.info(logMarker, s"Queued image for embedding with message ID: ${message.getMessageId}")
  }
}
