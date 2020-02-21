package model

import java.io.File

import com.amazonaws.services.s3.model.ObjectMetadata
import com.gu.mediaservice.lib.ImageIngestOperations
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.RequestLoggingContext
import com.gu.mediaservice.lib.net.URI
import com.gu.mediaservice.model.{Image, UploadInfo}
import lib.imaging.MimeTypeDetection
import lib.{DigestedFile, ImageLoaderConfig}
import org.joda.time.{DateTime, DateTimeZone}

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}

object ImageUploadProjector {

  import ImageUploadOps.toImageUploadOpsCfg

  def apply(config: ImageLoaderConfig, imageOps: ImageOperations)(implicit ec: ExecutionContext): ImageUploadProjector
  = new ImageUploadProjector(toImageUploadOpsCfg(config), imageOps)(ec)
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

class ImageUploadProjector(config: ImageUploadOpsCfg, imageOps: ImageOperations)
                          (implicit val ec: ExecutionContext) {

  private val imageUploadProjectionOps = new ImageUploadProjectionOps(config, imageOps)

  def projectImage(srcFileDigest: DigestedFile, extractedS3Meta: S3FileExtractedMetadata, requestLoggingContext: RequestLoggingContext): Future[Image] = {
    import extractedS3Meta._
    val DigestedFile(tempFile_, id_) = srcFileDigest
    // TODO more identifiers_ to rehydrate
    val identifiers_ = picdarUrn match {
      case Some(value) => Map[String, String]("picdarURN" -> value)
      case _ => Map[String, String]()
    }
    val uploadInfo_ = UploadInfo(filename = uploadFileName)
    //  Abort early if unsupported mime-type
    val mimeType_ = MimeTypeDetection.guessMimeType(tempFile_)

    val uploadRequest = UploadRequest(
      requestId = requestLoggingContext.requestId,
      imageId = id_,
      tempFile = tempFile_,
      mimeType = mimeType_,
      uploadTime = uploadTime,
      uploadedBy,
      identifiers = identifiers_,
      uploadInfo = uploadInfo_
    )

    imageUploadProjectionOps.projectImageFromUploadRequest(uploadRequest, requestLoggingContext)
  }

}

class ImageUploadProjectionOps(config: ImageUploadOpsCfg,
                               imageOps: ImageOperations)(implicit val ec: ExecutionContext) {

  import ImageUploadOps.{fromUploadRequestShared, toMetaMap}

  private val dependenciesWithProjectionsOnly = ImageUploadOpsDependencies(config, imageOps,
    projectOriginalFileAsS3Model, projectThumbnailFileAsS3Model, projectOptimisedPNGFileAsS3Model)

  def projectImageFromUploadRequest(uploadRequest: UploadRequest, requestLoggingContext: RequestLoggingContext): Future[Image] = {
    fromUploadRequestShared(uploadRequest, dependenciesWithProjectionsOnly, requestLoggingContext)
  }

  private def projectOriginalFileAsS3Model(uploadRequest: UploadRequest) = Future {
    val meta: Map[String, String] = toMetaMap(uploadRequest)
    val key = ImageIngestOperations.fileKeyFromId(uploadRequest.imageId)
    S3Ops.projectFileAsS3Object(
      config.originalFileBucket,
      key,
      uploadRequest.tempFile,
      uploadRequest.mimeType,
      meta
    )
  }

  private def projectThumbnailFileAsS3Model(uploadRequest: UploadRequest, thumbFile: File) = Future {
    val key = ImageIngestOperations.fileKeyFromId(uploadRequest.imageId)
    val thumbMimeType = Some("image/jpeg")
    S3Ops.projectFileAsS3Object(
      config.thumbBucket,
      key,
      thumbFile,
      thumbMimeType
    )
  }

  private def projectOptimisedPNGFileAsS3Model(uploadRequest: UploadRequest, optimisedPngFile: File) = Future {
    val key = ImageIngestOperations.optimisedPngKeyFromId(uploadRequest.imageId)
    val optimisedPngMimeType = Some("image/png")
    S3Ops.projectFileAsS3Object(
      config.originalFileBucket,
      key,
      optimisedPngFile,
      optimisedPngMimeType
    )
  }

}
