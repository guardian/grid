package model

import java.io.{File, FileOutputStream}
import java.util.UUID

import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.model.{ObjectMetadata, S3Object}
import com.gu.mediaservice.lib.{ImageIngestOperations, StorableOptimisedImage, StorableOriginalImage, StorableThumbImage}
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.cleanup.ImageProcessor
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.lib.net.URI
import com.gu.mediaservice.model.{Image, Jpeg, Png, UploadInfo}
import lib.imaging.{MimeTypeDetection, NoSuchImageExistsInS3}
import lib.{DigestedFile, ImageLoaderConfig}
import model.upload.{OptimiseWithPngQuant, UploadRequest}
import org.apache.tika.io.IOUtils
import org.joda.time.{DateTime, DateTimeZone}
import play.api.{Logger, MarkerContext}

import scala.collection.JavaConverters._
import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

object Projector {

  import Uploader.toImageUploadOpsCfg

  def apply(config: ImageLoaderConfig, imageOps: ImageOperations)(implicit ec: ExecutionContext): Projector
  = new Projector(toImageUploadOpsCfg(config), S3Ops.buildS3Client(config), imageOps, config.imageProcessor)
}

case class S3FileExtractedMetadata(
  uploadedBy: String,
  uploadTime: DateTime,
  uploadFileName: Option[String],
  picdarUrn: Option[String]
)

object S3FileExtractedMetadata {
  def apply(s3ObjectMetadata: ObjectMetadata): S3FileExtractedMetadata = {
    val lastModified = s3ObjectMetadata.getLastModified.toInstant.toString
    val fileUserMetadata = s3ObjectMetadata.getUserMetadata.asScala.toMap

    val uploadedBy = fileUserMetadata.getOrElse("uploaded_by", "re-ingester")
    val uploadedTimeRaw = fileUserMetadata.getOrElse("upload_time", lastModified)
    val uploadTime = new DateTime(uploadedTimeRaw).withZone(DateTimeZone.UTC)
    val picdarUrn = fileUserMetadata.get("identifier!picdarurn")

    val uploadFileNameRaw = fileUserMetadata.get("file_name")
    // The file name is URL encoded in  S3 metadata
    val uploadFileName = uploadFileNameRaw.map(URI.decode)

    S3FileExtractedMetadata(
      uploadedBy = uploadedBy,
      uploadTime = uploadTime,
      uploadFileName = uploadFileName,
      picdarUrn = picdarUrn,
    )
  }
}

class Projector(config: ImageUploadOpsCfg,
                s3: AmazonS3,
                imageOps: ImageOperations,
                processor: ImageProcessor) {

  private val imageUploadProjectionOps = new ImageUploadProjectionOps(config, imageOps, processor)

  def projectS3ImageById(imageUploadProjector: Projector, imageId: String, tempFile: File, requestId: UUID)
                        (implicit ec: ExecutionContext, logMarker: LogMarker): Future[Option[Image]] = {
    Future {
      import ImageIngestOperations.fileKeyFromId
      val s3Key = fileKeyFromId(imageId)

      if (!s3.doesObjectExist(config.originalFileBucket, s3Key))
        throw new NoSuchImageExistsInS3(config.originalFileBucket, s3Key)

      Logger.info(s"object exists, getting s3 object at s3://${config.originalFileBucket}/$s3Key to perform Image projection")

      val s3Source = s3.getObject(config.originalFileBucket, s3Key)
      val digestedFile = getSrcFileDigestForProjection(s3Source, imageId, tempFile)
      val extractedS3Meta = S3FileExtractedMetadata(s3Source.getObjectMetadata)

      val finalImageFuture = imageUploadProjector.projectImage(digestedFile, extractedS3Meta, requestId)
      val finalImage = Await.result(finalImageFuture, Duration.Inf)
      Some(finalImage)
    }
  }

  private def getSrcFileDigestForProjection(s3Src: S3Object, imageId: String, tempFile: File) = {
    IOUtils.copy(s3Src.getObjectContent, new FileOutputStream(tempFile))
    DigestedFile(tempFile, imageId)
  }

  def projectImage(srcFileDigest: DigestedFile, extractedS3Meta: S3FileExtractedMetadata, requestId: UUID)
                  (implicit ec: ExecutionContext, logMarker: LogMarker): Future[Image] = {
    import extractedS3Meta._
    val DigestedFile(tempFile_, id_) = srcFileDigest
    // TODO more identifiers_ to rehydrate
    val identifiers_ = picdarUrn match {
      case Some(value) => Map[String, String]("picdarURN" -> value)
      case _ => Map[String, String]()
    }
    val uploadInfo_ = UploadInfo(filename = uploadFileName)

    MimeTypeDetection.guessMimeType(tempFile_) match {
      case util.Left(unsupported) => Future.failed(unsupported)
      case util.Right(mimeType) =>
        val uploadRequest = UploadRequest(
          requestId = requestId,
          imageId = id_,
          tempFile = tempFile_,
          mimeType = Some(mimeType),
          uploadTime = uploadTime,
          uploadedBy,
          identifiers = identifiers_,
          uploadInfo = uploadInfo_
        )
        imageUploadProjectionOps.projectImageFromUploadRequest(uploadRequest)
    }
  }
}

class ImageUploadProjectionOps(config: ImageUploadOpsCfg,
                               imageOps: ImageOperations,
                               processor: ImageProcessor) {

  import Uploader.{fromUploadRequestShared, toMetaMap}


  def projectImageFromUploadRequest(uploadRequest: UploadRequest)
                                   (implicit ec: ExecutionContext, logMarker: LogMarker): Future[Image] = {
    val dependenciesWithProjectionsOnly = ImageUploadOpsDependencies(config, imageOps,
    projectOriginalFileAsS3Model, projectThumbnailFileAsS3Model, projectOptimisedPNGFileAsS3Model)
    fromUploadRequestShared(uploadRequest, dependenciesWithProjectionsOnly, processor)
  }

  private def projectOriginalFileAsS3Model(storableOriginalImage: StorableOriginalImage)
                                          (implicit ec: ExecutionContext)= Future {
    val key = ImageIngestOperations.fileKeyFromId(storableOriginalImage.id)
    S3Ops.projectFileAsS3Object(
      config.originalFileBucket,
      key,
      storableOriginalImage.file,
      Some(storableOriginalImage.mimeType),
      storableOriginalImage.meta
    )
  }

  private def projectThumbnailFileAsS3Model(storableThumbImage: StorableThumbImage)(implicit ec: ExecutionContext) = Future {
    val key = ImageIngestOperations.fileKeyFromId(storableThumbImage.id)
    val thumbMimeType = Some(OptimiseWithPngQuant.optimiseMimeType) // this IS what we will generate.
    S3Ops.projectFileAsS3Object(
      config.thumbBucket,
      key,
      storableThumbImage.file,
      thumbMimeType
    )
  }

  private def projectOptimisedPNGFileAsS3Model(storableOptimisedImage: StorableOptimisedImage)(implicit ec: ExecutionContext) = Future {
    val key = ImageIngestOperations.optimisedPngKeyFromId(storableOptimisedImage.id)
    val optimisedPngMimeType = Some(ImageOperations.thumbMimeType) // this IS what we will generate.
    S3Ops.projectFileAsS3Object(
      config.originalFileBucket,
      key,
      storableOptimisedImage.file,
      optimisedPngMimeType
    )
  }

}
