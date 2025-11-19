package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.{Jpeg, MimeType, Png, Tiff}
import software.amazon.awssdk.services.s3vectors.model.QueryVectorsResponse

import java.nio.file.{Files, Path}
import java.util.Base64
import scala.concurrent.{ExecutionContext, Future}

sealed trait CohereCompatibleMimeType
case object CohereJpeg extends CohereCompatibleMimeType
case object CoherePng extends CohereCompatibleMimeType

class Embedder(s3vectors: S3Vectors, bedrock: Bedrock)(implicit ec: ExecutionContext) extends GridLogging {
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

  def createEmbeddingAndStore(fileType: MimeType, imageFilePath: Path, imageId: String)(implicit logMarker: LogMarker): Future[Unit] = {
    meetsCohereRequirements(fileType, imageFilePath) match {
      case Left(error) => {
        logger.info(logMarker, s"Skipping image embedding for $imageId as it does not meet the requirements: $error")
        Future.successful(())
      }
      case Right(imageType) => {
        val base64EncodedString: String = Base64.getEncoder().encodeToString(Files.readAllBytes(imageFilePath))
        bedrock.createImageEmbedding(base64EncodedString, imageType)
          .flatMap(s3vectors.storeEmbedding(_, imageId))
      }
    }
  }

  def createEmbeddingAndSearch(query: String)(implicit logMarker: LogMarker): Future[QueryVectorsResponse] = {
    logger.info(logMarker, s"Searching for image embedding for $query")
    val embeddingFuture = bedrock.createEmbedding(InputType.SearchDocument, query)
    embeddingFuture.map { embedding =>
      s3vectors.searchVectorStore(embedding, query)
    }
  }

}
