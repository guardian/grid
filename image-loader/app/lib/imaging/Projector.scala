package lib.imaging

import java.io.{File, FileOutputStream}

import com.amazonaws.services.s3.model.S3Object
import com.gu.mediaservice.lib.ImageIngestOperations
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.logging.RequestLoggingContext
import com.gu.mediaservice.model.Image
import lib.{DigestedFile, ImageLoaderConfig}
import model.{ImageUploadProjector, S3FileExtractedMetadata}
import org.apache.tika.io.IOUtils
import play.api.Logger

import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration.Duration

class Projector(val config: ImageLoaderConfig) {

  def projectS3ImageById(imageUploadProjector: ImageUploadProjector, imageId: String, requestLoggingContext: RequestLoggingContext, tempFile: File)(implicit ex: ExecutionContext): Future[Option[Image]] = {
    Logger.info(s"XXX projecting image: $imageId")(requestLoggingContext.toMarker())
    Future {
      import ImageIngestOperations.fileKeyFromId
      val s3Key = fileKeyFromId(imageId)
      val s3 = S3Ops.buildS3Client(config)

      if (!s3.doesObjectExist(config.imageBucket, s3Key))
        throw new NoSuchImageExistsInS3(config.imageBucket, s3Key)

      Logger.info(s"object exists, getting s3 object at s3://${config.imageBucket}/$s3Key to perform Image projection")(requestLoggingContext.toMarker())

      val s3Source = s3.getObject(config.imageBucket, s3Key)
      val digestedFile = getSrcFileDigestForProjection(s3Source, imageId, requestLoggingContext, tempFile)
      val extractedS3Meta = S3FileExtractedMetadata(s3Source.getObjectMetadata)

      val finalImageFuture = imageUploadProjector.projectImage(digestedFile, extractedS3Meta, requestLoggingContext)
      val finalImage = Await.result(finalImageFuture, Duration.Inf)
      Some(finalImage)
    }
  }

  private def getSrcFileDigestForProjection(s3Src: S3Object, imageId: String, requestLoggingContext: RequestLoggingContext, tempFile: File) = {
    IOUtils.copy(s3Src.getObjectContent, new FileOutputStream(tempFile))
    DigestedFile(tempFile, imageId)
  }
}

