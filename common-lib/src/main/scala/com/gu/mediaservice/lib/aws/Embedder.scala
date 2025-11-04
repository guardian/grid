package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.{Jpeg, MimeType, Png, Tiff}
import software.amazon.awssdk.services.s3vectors.model.{PutVectorsResponse, QueryVectorsResponse, VectorData}

import java.nio.file.{Files, Path}
import java.util.Base64
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.SeqHasAsJava

sealed trait CohereCompatibleMimeType
case object CohereJpeg extends CohereCompatibleMimeType
case object CoherePng extends CohereCompatibleMimeType

class Embedder(s3vectors: S3Vectors, bedrock: Bedrock) extends GridLogging {
  // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v3.html#:~:text=The%20image%20must%20be%20in%20either%20image/jpeg%20or%20image/png%20format%20and%20has%20a%20maximum%20size%20of%205MB
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

  private def convertEmbeddingToVectorData(embedding: List[Float]): VectorData = {
    VectorData
      .builder()
      .float32(embedding.map(float2Float).asJava)
      .build()
  }

  def imageToImageSearch(imageId: String)(implicit ec: ExecutionContext, logMarker: LogMarker): QueryVectorsResponse = {
//    Find image in vector store
//    We are assuming that the image is already in the vector store.
//    From image_id --> vectorData
    val vector = s3vectors.findVectorForImageId(imageId)
//    Run cosine similarity over image
      s3vectors.searchVectorStore(vector)
  }

  def createEmbeddingAndSearch(q: String)(implicit ec: ExecutionContext, logMarker: LogMarker): Future[QueryVectorsResponse] = {

    logger.info(logMarker, s"Searching for image embedding for $q")

    val embeddingFuture = bedrock.createSearchTermEmbedding(q: String)
    embeddingFuture.map { embedding =>
//      We need to convert the embedding to a VectorData object for the S3 Vector Store API
      val vectorData = convertEmbeddingToVectorData(embedding)
      s3vectors.searchVectorStore(vectorData)
    }
  }

}
