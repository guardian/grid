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

  def fromUploadRequest(uploadRequest: UploadRequest, storage: ImageStorage): Future[ImageUpload] = {
    val metadataCleaners = new MetadataCleaners(MetadataConfig.creditBylineMap)

    bracket(thumbCreateFuture(uploadRequest.tempFile))(_.delete) { thumb =>
      for {
        s3Source     <- sourceStoreFuture(uploadRequest, storage)
        s3Thumb      <-
          storage.storeThumbnail(
            uploadRequest.id,
            uploadRequest.tempFile,
            uploadRequest.mimeType
          )
        fileMetadata <- fileMetadataFuture(uploadRequest.tempFile)

        metadata      = ImageMetadataConverter.fromFileMetadata(fileMetadata)
        cleanMetadata = metadataCleaners.clean(metadata)

        asset = Asset.fromS3Object(s3Source)
        thumb = Asset.fromS3Object(s3Thumb)
      }
      yield ImageUpload(
        uploadRequest,
        Image.fromUploadRequest(
          uploadRequest,
          asset,
          thumb,
          fileMetadata,
          cleanMetadata
        )
      )
    }
  }

  def thumbCreateFuture(f: File) = Thumbnailer.createThumbnail(Config.thumbWidth, f.toString)
  def sourceStoreFuture(uploadRequest: UploadRequest, storage: ImageStorage) = storage.storeImage(
    uploadRequest.id,
    uploadRequest.tempFile,
    uploadRequest.mimeType,
    Map("uploaded_by" -> uploadRequest.uploadedBy) ++ uploadRequest.identifiersMeta
  )
  def dimensionsFuture(f: File)  = FileMetadataReader.dimensions(f)
  def fileMetadataFuture(f: File) = FileMetadataReader.fromIPTCHeaders(f)
}
