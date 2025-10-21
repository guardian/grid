package com.gu.mediaservice.lib.aws
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.{Jpeg, MimeType}
import software.amazon.awssdk.services.s3vectors.model.PutVectorsResponse

import java.nio.file.{Files, Path}
import java.util.Base64
import scala.concurrent.{ExecutionContext, Future}

class Embedder(s3vectors: S3Vectors, bedrock: Bedrock) extends GridLogging {

  //  We can't be sure that the image is JPEG or <5MB so we need to check and log
  def meetsCohereRequirements(fileType: MimeType, imageFilePath: Path)(implicit logMarker: LogMarker): Boolean = {
    val fileSize = Files.size(imageFilePath)
    val fiveMB = 5_000_000

    // Hi Ellen! This is Joe
    // Here are some image ids that are between 5MB and 5MiB:
    //  [
    //    "3bb95474d37f14d71ba38b63db324704c3947b00",
    //    5241471,
    //    "image/jpeg"
    //  ]
    //  [
    //    "3bf2ca04f570842fba77ba3a882fb53a59e9bc00",
    //    5004231,
    //    "image/jpeg"
    //  ]
    //  [
    //    "33b401db3a8846496bed4c3d12fa2ec35be5b900",
    //    5071551,
    //    "image/jpeg"
    //  ]
    //  [
    //    "402fe271245dcf994fbd90ff75b99f3eff763800",
    //    5052613,
    //    "image/jpeg"
    //  ]
    //  [
    //    "4034a0e1909866c5f3f64b23f94ddcf2cdd80400",
    //    5189131,
    //    "image/jpeg"
    //  ]

    //    Step 1: check the file extension
    if (fileType != Jpeg) {
      logger.error(logMarker, s"Image file type is not JPEG. File type: $fileType")
      false
    }
    //    Step 2: check the file type
    else if (fileSize > fiveMB) {
      logger.error(logMarker, s"Image file is >5MB. File size: $fileSize")
      false
    } else true
  }

  def createEmbeddingAndStore(fileType: MimeType, imageFilePath: Path, imageId: String)(implicit ec: ExecutionContext, logMarker: LogMarker
  ): Future[Option[PutVectorsResponse]] = {
    if (!meetsCohereRequirements(fileType, imageFilePath)(logMarker)) {
       logger.info(logMarker, s"Skipping image embedding for $imageId as it does not meet the requirements.")
       Future.successful(None)
    } else {
      val base64EncodedString: String = Base64.getEncoder().encodeToString(Files.readAllBytes(imageFilePath))
      val embeddingFuture = bedrock.createImageEmbedding(base64EncodedString)
      embeddingFuture.map { embedding =>
        Some(s3vectors.storeEmbeddingInS3VectorStore(embedding, imageId))
      }
    }
  }
}
