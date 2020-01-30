package model

import java.io.File
import java.util.UUID

import com.gu.mediaservice.lib.ImageIngestOperations
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.model._
import lib.imaging.MimeTypeDetection
import lib.{DigestedFile, ImageLoaderConfig}
import org.joda.time.{DateTime, DateTimeZone}

import scala.concurrent.{ExecutionContext, Future}

object ImageUploadProjector {

  import ImageUploadOps.toImageUploadOpsCfg

  def apply(config: ImageLoaderConfig, imageOps: ImageOperations)(implicit ec: ExecutionContext): ImageUploadProjector
  = new ImageUploadProjector(toImageUploadOpsCfg(config), imageOps)(ec)
}

class ImageUploadProjector(config: ImageUploadOpsCfg, imageOps: ImageOperations)
                          (implicit val ec: ExecutionContext) {

  private val imageUploadProjectionOps = new ImageUploadProjectionOps(config, imageOps)

  def projectImage(srcFileDigest: DigestedFile, uploadedBy: String, uploadedTime: DateTime, uploadFileName: Option[String]): Future[Image] = {
    val DigestedFile(tempFile_, id_) = srcFileDigest
    // TODO identifiers_ to rehydrate
    val identifiers_ = Map[String, String]()
    val uploadInfo_ = UploadInfo(filename = uploadFileName)
    //  Abort early if unsupported mime-type
    val mimeType_ = MimeTypeDetection.guessMimeType(tempFile_)
    val notUsedReqID = UUID.randomUUID()
    val uploadRequest = UploadRequest(
      requestId = notUsedReqID,
      imageId = id_,
      tempFile = tempFile_,
      mimeType = mimeType_,
      uploadedTime,
      uploadedBy,
      identifiers = identifiers_,
      uploadInfo = uploadInfo_
    )

    imageUploadProjectionOps.projectImageFromUploadRequest(uploadRequest)
  }

}

class ImageUploadProjectionOps(config: ImageUploadOpsCfg,
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
      config.originalFileBucket,
      key,
      uploadRequest.tempFile,
      uploadRequest.mimeType,
      meta
    )
  }

  private def projectThumbnailFileAsS3Model(uploadRequest: UploadRequest, thumbFile: File) = Future {
    val key = ImageIngestOperations.fileKeyFromId(uploadRequest.imageId)
    val thumbMimeType = Some(Jpeg)
    S3Ops.projectFileAsS3Object(
      config.thumbBucket,
      key,
      thumbFile,
      thumbMimeType
    )
  }

  private def projectOptimisedPNGFileAsS3Model(uploadRequest: UploadRequest, optimisedPngFile: File) = Future {
    val key = ImageIngestOperations.optimisedPngKeyFromId(uploadRequest.imageId)
    val optimisedPngMimeType = Some(Png)
    S3Ops.projectFileAsS3Object(
      config.originalFileBucket,
      key,
      optimisedPngFile,
      optimisedPngMimeType
    )
  }

}
