package model

import java.io.File

import play.api.libs.concurrent.Execution.Implicits._
import scala.concurrent.Future

import lib.imaging.{FileMetadataReader, Thumbnailer}
import lib.Config

import com.gu.mediaservice.lib.metadata.ImageMetadataConverter
import com.gu.mediaservice.lib.resource.FutureResources._
import com.gu.mediaservice.lib.cleanup.{SupplierProcessors, MetadataCleaners}
import com.gu.mediaservice.lib.config.MetadataConfig
import com.gu.mediaservice.lib.formatting._

import lib.storage.ImageStore
import com.gu.mediaservice.model._

case class ImageUpload(uploadRequest: UploadRequest, image: Image)
case object ImageUpload {
  val metadataCleaners = new MetadataCleaners(MetadataConfig.allPhotographersMap)

  def fromUploadRequest(uploadRequest: UploadRequest): Future[ImageUpload] = {

    val uploadedFile = uploadRequest.tempFile

    // These futures are started outside the for-comprehension, otherwise they will not run in parallel
    val sourceStoreFuture      = storeSource(uploadRequest)
    val thumbFuture            = Thumbnailer.createThumbnail(Config.thumbWidth, uploadedFile.toString)
    val sourceDimensionsFuture = FileMetadataReader.dimensions(uploadedFile)
    val fileMetadataFuture     = FileMetadataReader.fromIPTCHeaders(uploadedFile)

    bracket(thumbFuture)(_.delete) { thumb =>
      // Run the operations in parallel
      val thumbStoreFuture      = storeThumbnail(uploadRequest, thumb)
      val thumbDimensionsFuture = FileMetadataReader.dimensions(thumb)

      for {
        s3Source         <- sourceStoreFuture
        s3Thumb          <- thumbStoreFuture
        sourceDimensions <- sourceDimensionsFuture
        thumbDimensions  <- thumbDimensionsFuture
        fileMetadata     <- fileMetadataFuture

        metadata      = ImageMetadataConverter.fromFileMetadata(fileMetadata)
        cleanMetadata = metadataCleaners.clean(metadata)

        sourceAsset = Asset.fromS3Object(s3Source, sourceDimensions)
        thumbAsset  = Asset.fromS3Object(s3Thumb,  thumbDimensions)

        baseImage      = createImage(uploadRequest, sourceAsset, thumbAsset, fileMetadata, cleanMetadata)
        processedImage = SupplierProcessors.process(baseImage)

        // FIXME: dirty hack to sync the originalUsageRights and originalMetadata as well
        finalImage     = processedImage.copy(
          originalMetadata    = processedImage.metadata,
          originalUsageRights = processedImage.usageRights
        )
      }
      yield ImageUpload(uploadRequest, finalImage)
    }
  }

  def storeSource(uploadRequest: UploadRequest) = ImageStore.storeOriginal(
    uploadRequest.id,
    uploadRequest.tempFile,
    uploadRequest.mimeType,
    Map(
      "uploaded_by" -> uploadRequest.uploadedBy,
      "upload_time" -> printDateTime(uploadRequest.uploadTime)
    ) ++ uploadRequest.identifiersMeta
  )
  def storeThumbnail(uploadRequest: UploadRequest, thumbFile: File) = ImageStore.storeThumbnail(
    uploadRequest.id,
    thumbFile,
    uploadRequest.mimeType
  )


  private def createImage(uploadRequest: UploadRequest, source: Asset, thumbnail: Asset,
                  fileMetadata: FileMetadata, metadata: ImageMetadata): Image = {
    val usageRights = NoRights
    Image(
      uploadRequest.id,
      uploadRequest.uploadTime,
      uploadRequest.uploadedBy,
      Some(uploadRequest.uploadTime),
      uploadRequest.identifiers,
      uploadRequest.uploadInfo,
      source,
      Some(thumbnail),
      fileMetadata,
      None,
      metadata,
      metadata,
      usageRights,
      usageRights,
      List()
    )
  }

}
