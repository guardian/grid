package model

import java.io.{File, FileOutputStream}
import java.util.UUID
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.model.{ObjectMetadata, S3Object => AwsS3Object}
import com.gu.mediaservice.lib.{ImageIngestOperations, ImageStorageProps, StorableOptimisedImage, StorableOriginalImage, StorableThumbImage}
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.aws.S3Object
import com.gu.mediaservice.lib.cleanup.ImageProcessor
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.lib.net.URI
import com.gu.mediaservice.model.{Image, UploadInfo}
import lib.imaging.{MimeTypeDetection, NoSuchImageExistsInS3}
import lib.{DigestedFile, ImageLoaderConfig}
import model.upload.UploadRequest
import org.apache.tika.io.IOUtils
import org.joda.time.{DateTime, DateTimeZone}
import play.api.Logger

import scala.collection.JavaConverters._
import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

object Projector {

  import Uploader.toImageUploadOpsCfg

  def apply(config: ImageLoaderConfig, imageOps: ImageOperations, processor: ImageProcessor)(implicit ec: ExecutionContext): Projector
  = new Projector(toImageUploadOpsCfg(config), S3Ops.buildS3Client(config), imageOps, processor)
}

case class S3FileExtractedMetadata(
  uploadedBy: String,
  uploadTime: DateTime,
  uploadFileName: Option[String],
  identifiers: Map[String, String]
)

object S3FileExtractedMetadata {
  def apply(s3ObjectMetadata: ObjectMetadata): S3FileExtractedMetadata = {
    val lastModified = new DateTime(s3ObjectMetadata.getLastModified)
    val userMetadata = s3ObjectMetadata.getUserMetadata.asScala.toMap
    apply(lastModified, userMetadata)
  }

  def apply(lastModified: DateTime, userMetadata: Map[String, String]): S3FileExtractedMetadata = {
    val fileUserMetadata = userMetadata.map { case (key, value) =>
      // Fix up the contents of the metadata.
      (
        // The keys used to be named with underscores instead of dashes but due to localstack being written in Python
        // this didn't work locally (see https://github.com/localstack/localstack/issues/459)
        key.replaceAll("_", "-"),
        // The values are now all URL encoded and it is assumed safe to decode historical values too (based on the tested corpus)
        URI.decode(value)
      )
    }

    val uploadedBy = fileUserMetadata.getOrElse(ImageStorageProps.uploadedByMetadataKey, "re-ingester")
    val uploadedTimeRaw = fileUserMetadata.get(ImageStorageProps.uploadTimeMetadataKey).map(new DateTime(_).withZone(DateTimeZone.UTC))
    val uploadTime = uploadedTimeRaw.getOrElse(lastModified)
    val identifiers = fileUserMetadata.filter{ case (key, _) =>
      key.startsWith(ImageStorageProps.identifierMetadataKeyPrefix)
    }.map{ case (key, value) =>
      key.stripPrefix(ImageStorageProps.identifierMetadataKeyPrefix) -> value
    }

    val uploadFileName = fileUserMetadata.get(ImageStorageProps.filenameMetadataKey)

    S3FileExtractedMetadata(
      uploadedBy = uploadedBy,
      uploadTime = uploadTime,
      uploadFileName = uploadFileName,
      identifiers = identifiers,
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

  private def getSrcFileDigestForProjection(s3Src: AwsS3Object, imageId: String, tempFile: File) = {
    IOUtils.copy(s3Src.getObjectContent, new FileOutputStream(tempFile))
    DigestedFile(tempFile, imageId)
  }

  def projectImage(srcFileDigest: DigestedFile, extractedS3Meta: S3FileExtractedMetadata, requestId: UUID)
                  (implicit ec: ExecutionContext, logMarker: LogMarker): Future[Image] = {
    val DigestedFile(tempFile_, id_) = srcFileDigest

    val identifiers_ = extractedS3Meta.identifiers
    val uploadInfo_ = UploadInfo(filename = extractedS3Meta.uploadFileName)

    MimeTypeDetection.guessMimeType(tempFile_) match {
      case util.Left(unsupported) => Future.failed(unsupported)
      case util.Right(mimeType) =>
        val uploadRequest = UploadRequest(
          requestId = requestId,
          imageId = id_,
          tempFile = tempFile_,
          mimeType = Some(mimeType),
          uploadTime = extractedS3Meta.uploadTime,
          uploadedBy = extractedS3Meta.uploadedBy,
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
    S3Object(
      config.originalFileBucket,
      key,
      storableOriginalImage.file,
      Some(storableOriginalImage.mimeType),
      storableOriginalImage.meta
    )
  }

  private def projectThumbnailFileAsS3Model(storableThumbImage: StorableThumbImage)(implicit ec: ExecutionContext) = Future {
    val key = ImageIngestOperations.fileKeyFromId(storableThumbImage.id)
    val thumbMimeType = Some(ImageOperations.thumbMimeType)
    S3Object(
      config.thumbBucket,
      key,
      storableThumbImage.file,
      thumbMimeType
    )
  }

  private def projectOptimisedPNGFileAsS3Model(storableOptimisedImage: StorableOptimisedImage)(implicit ec: ExecutionContext) = Future {
    val key = ImageIngestOperations.optimisedPngKeyFromId(storableOptimisedImage.id)
    val optimisedPngMimeType = Some(ImageOperations.thumbMimeType) // this IS what we will generate.
    S3Object(
      config.originalFileBucket,
      key,
      storableOptimisedImage.file,
      optimisedPngMimeType
    )
  }

}
