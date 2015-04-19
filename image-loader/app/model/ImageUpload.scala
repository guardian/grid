package model

import java.io.File

import play.api.libs.concurrent.Execution.Implicits._
import scala.concurrent.Future

import lib.imaging.{FileMetadataReader, MimeTypeDetection, Thumbnailer}
import lib.Config

import com.gu.mediaservice.lib.metadata.ImageMetadataConverter
import com.gu.mediaservice.lib.resource.FutureResources._
import com.gu.mediaservice.lib.cleanup.MetadataCleaners
import com.gu.mediaservice.lib.config.MetadataConfig
import com.gu.mediaservice.lib.ImageStorage

import com.gu.mediaservice.model.Asset


case class ImageUpload(uploadRequest: UploadRequest, image: Image)
case object ImageUpload {

  val metadataCleaners = new MetadataCleaners(MetadataConfig.creditBylineMap)

  def fromUploadRequest(uploadRequest: UploadRequest, storage: ImageStorage): Future[ImageUpload] = {

    val uploadedFile = uploadRequest.tempFile

    // These futures are started outside the for-comprehension, otherwise they will not run in parallel
    val sourceStoreFuture  = storeSource(uploadRequest, storage)
    val thumbFuture        = Thumbnailer.createThumbnail(Config.thumbWidth, uploadedFile.toString)
    val fileMetadataFuture = FileMetadataReader.fromIPTCHeaders(uploadedFile)

    bracket(thumbFuture)(_.delete) { thumb =>

      for {
        s3Source     <- sourceStoreFuture
        s3Thumb      <- storeThumbnail(uploadRequest, thumb, storage)
        fileMetadata <- fileMetadataFuture

        metadata      = ImageMetadataConverter.fromFileMetadata(fileMetadata)
        cleanMetadata = metadataCleaners.clean(metadata)

        sourceAsset = Asset.fromS3Object(s3Source)
        thumbAsset  = Asset.fromS3Object(s3Thumb)
      }
      yield ImageUpload(
        uploadRequest,
        Image.fromUploadRequest(
          uploadRequest,
          sourceAsset,
          thumbAsset,
          fileMetadata,
          cleanMetadata
        )
      )
    }
  }

  def storeSource(uploadRequest: UploadRequest, storage: ImageStorage) = storage.storeImage(
    uploadRequest.id,
    uploadRequest.tempFile,
    uploadRequest.mimeType,
    Map("uploaded_by" -> uploadRequest.uploadedBy) ++ uploadRequest.identifiersMeta
  )
  def storeThumbnail(uploadRequest: UploadRequest, thumbFile: File, storage: ImageStorage) = storage.storeThumbnail(
    uploadRequest.id,
    thumbFile,
    uploadRequest.mimeType
  )
  def dimensionsFuture(f: File)  = FileMetadataReader.dimensions(f)
}
