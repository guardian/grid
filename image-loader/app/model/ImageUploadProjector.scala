package model

import java.io.File
import java.util.UUID

import com.gu.mediaservice.lib.ImageIngestOperations
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.resource.FutureResources.bracket
import com.gu.mediaservice.model.{Image, UploadInfo}
import lib.imaging.{FileMetadataReader, MimeTypeDetection}
import lib.{DigestedFile, ImageLoaderConfig}
import org.joda.time.DateTime

import scala.concurrent.{ExecutionContext, Future}

object ImageUploadProjector {
  def apply(config: ImageLoaderConfig, imageOps: ImageOperations)(implicit ec: ExecutionContext): ImageUploadProjector =
    new ImageUploadProjector(config, imageOps)(ec)
}

class ImageUploadProjector(config: ImageLoaderConfig, imageOps: ImageOperations)
                          (implicit val ec: ExecutionContext) {

  private val imageUploadProjectionOps = new ImageUploadProjectionOps(config, imageOps)

  def projectImage(srcFileDigest: DigestedFile, fileUserMetadata: Map[String, String]): Future[Image] = {
    val DigestedFile(tempFile_, id_) = srcFileDigest
    // identifiers_ to rehydrate
    val identifiers_ = Map[String, String]()
    // filename to rehydrate
    val uploadInfo_ = UploadInfo(filename = None)
    // TODO: handle the error thrown by an invalid string to `DateTime`
    // only allow uploadTime to be set by AuthenticatedService
    val uploadedBy_ = fileUserMetadata.getOrElse("uploaded_by", "reingester")
    val defaultTimeWhileReingestIfMetaMissing = DateTime.now().minusMonths(2).toString
    val uploadedTimeRaw = fileUserMetadata.getOrElse("upload_time", defaultTimeWhileReingestIfMetaMissing)

    val uploadTime_ = new DateTime(uploadedTimeRaw)
    // Abort early if unsupported mime-type
    val mimeType_ = MimeTypeDetection.guessMimeType(tempFile_)
    val notUsedReqID = UUID.randomUUID()
    val uploadRequest = UploadRequest(
      requestId = notUsedReqID,
      imageId = id_,
      tempFile = tempFile_,
      mimeType = mimeType_,
      uploadTime = uploadTime_,
      uploadedBy = uploadedBy_,
      identifiers = identifiers_,
      uploadInfo = uploadInfo_
    )

    imageUploadProjectionOps.projectImageFromUploadRequest(uploadRequest)
  }

}

class ImageUploadProjectionOps(config: ImageLoaderConfig,
                               imageOps: ImageOperations)(implicit val ec: ExecutionContext) {

  import ImageUploadOps.{fromUploadRequestShared, toMetaMap}

  private val dependenciesWithProjectionsOnly = ImageUploadOpsDependencies(config, imageOps,
    projectOriginalFileAsS3Model, projectThumbnailFileAsS3Model, projectOptimisedPNGFileAsS3Model)

  def projectImageFromUploadRequest(uploadRequest: UploadRequest): Future[Image] = {
    fromUploadRequestShared(uploadRequest, dependenciesWithProjectionsOnly)
  }

  private def projectOriginalFileAsS3Model(uploadRequest: UploadRequest) = Future {
    val meta: Map[String, String] = toMetaMap(uploadRequest)
    val key = ImageIngestOperations.fileKeyFromId(uploadRequest.imageId)
    S3Ops.projectFileAsS3Object(
      config.imageBucket,
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
      config.thumbnailBucket,
      key,
      uploadRequest.tempFile,
      thumbMimeType
    )
  }

  private def projectOptimisedPNGFileAsS3Model(uploadRequest: UploadRequest, thumbFile: File) = Future {
    val key = ImageIngestOperations.optimisedPngKeyFromId(uploadRequest.imageId)
    val optimisedPngMimeType = Some("image/jpeg")
    S3Ops.projectFileAsS3Object(
      config.imageBucket,
      key,
      uploadRequest.tempFile,
      optimisedPngMimeType
    )
  }

}
