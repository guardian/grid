package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.{Jpeg, MimeType, Png, Tiff}
import software.amazon.awssdk.services.s3vectors.model.PutVectorsResponse

import java.nio.file.{Files, Path}
import java.util.Base64
import scala.concurrent.{ExecutionContext, Future}

sealed trait CohereCompatibleMimeType
case object CohereJpeg extends CohereCompatibleMimeType
case object CoherePng extends CohereCompatibleMimeType

class Embedder(s3vectors: S3Vectors, bedrock: Bedrock) extends GridLogging {
  def meetsCohereRequirements(fileType: MimeType, imageFilePath: Path)(implicit logMarker: LogMarker): Either[String, CohereCompatibleMimeType]= {
    val fileSize = Files.size(imageFilePath)
    val fiveMB = 5_000_000

    fileType match {
      case _ if fileSize > fiveMB => Left(s"Image file is >5MB. File size: $fileSize")
      case Jpeg => Right(CohereJpeg)
      case Png => Right(CoherePng)
      case Tiff => Left("Image file type is not supported. File type: Tiff")
    }
  }

  def createEmbeddingAndStore(fileType: MimeType, imageFilePath: Path, imageId: String)(implicit ec: ExecutionContext, logMarker: LogMarker
  ): Future[Option[PutVectorsResponse]] = {
    meetsCohereRequirements(fileType, imageFilePath)(logMarker) match {
      case Left(error) => {
        logger.info(logMarker, s"Skipping image embedding for $imageId as it does not meet the requirements: $error")
        Future.successful(None)
      }
      case Right(imageType) => {
        val base64EncodedString: String = Base64.getEncoder().encodeToString(Files.readAllBytes(imageFilePath))
        val embeddingFuture = bedrock.createImageEmbedding(base64EncodedString, imageType)
        embeddingFuture.map { embedding =>
          Some(s3vectors.storeEmbeddingInS3VectorStore(embedding, imageId))
        }
      }
    }
  }
}
