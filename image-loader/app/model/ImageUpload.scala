package model

import java.io.File

import play.api.libs.concurrent.Execution.Implicits._
import scala.concurrent.Future

import lib.imaging.FileMetadataReader
import lib.Config

import com.gu.mediaservice.lib.metadata.{FileMetadataHelper, ImageMetadataConverter}
import com.gu.mediaservice.lib.resource.FutureResources._
import com.gu.mediaservice.lib.cleanup.{SupplierProcessors, MetadataCleaners}
import com.gu.mediaservice.lib.config.MetadataConfig
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.formatting._
import scala.sys.process._

import lib.storage.ImageStore
import com.gu.mediaservice.model._

case class ImageUpload(uploadRequest: UploadRequest, image: Image)
case object ImageUpload {
  val metadataCleaners = new MetadataCleaners(MetadataConfig.allPhotographersMap)

  import Config.{thumbWidth, thumbQuality, tempDir}

  def fromUploadRequest(uploadRequest: UploadRequest): Future[ImageUpload] = {

    val uploadedFile = uploadRequest.tempFile


    val fileMetadataFuture = uploadRequest.mimeType match {
      case Some("image/png") => FileMetadataReader.fromICPTCHeadersWithColorInfo(uploadedFile)
      case _ => FileMetadataReader.fromIPTCHeaders(uploadedFile)
    }

    for {
      fileMetadata <- fileMetadataFuture
    } yield {

      val uploadIsPng24 = isPng24(uploadRequest.mimeType, fileMetadata)

      // These futures are started outside the for-comprehension, otherwise they will not run in parallel
      val sourceStoreFuture = storeSource(uploadRequest)
      // FIXME: pass mimeType
      val colourModelFuture = ImageOperations.identifyColourModel(uploadedFile, "image/jpeg")
      val sourceDimensionsFuture = FileMetadataReader.dimensions(uploadedFile, uploadRequest.mimeType)

      val thumbFuture = for {
        fileMetadata <- fileMetadataFuture
        colourModel <- colourModelFuture
        iccColourSpace = FileMetadataHelper.normalisedIccColourSpace(fileMetadata)
        thumb <- ImageOperations.createThumbnail(uploadedFile, thumbWidth, thumbQuality, tempDir, iccColourSpace, colourModel)
      } yield thumb

      val pngOption = if (uploadIsPng24) {
        val optimisedPng = tempDir.getAbsolutePath() + "/optimisedpng" + ".png"
        Seq("pngquant", "--quality", "1-85", uploadedFile.getAbsolutePath(), "--output", optimisedPng).!

        Some(new File(optimisedPng))
      } else
        None

      bracket(thumbFuture)(_.delete) { thumb =>
        // Run the operations in parallel
        val thumbStoreFuture = storeThumbnail(uploadRequest, thumb)

        val pngStoreFuture = if (uploadIsPng24)
            Some(storeOptimisedPng(uploadRequest, pngOption.get)).map(result => result.map(Option(_)))
              .getOrElse(Future.successful(None))
            else
              Future(None)

        val thumbDimensionsFuture = FileMetadataReader.dimensions(thumb, Some("image/jpeg"))

        val pngDimensionsFuture = if (uploadIsPng24)
            FileMetadataReader.dimensions(pngOption.get, Some("image/png"))
          else
            Future(None)

        for {
          s3Source <- sourceStoreFuture
          s3Thumb <- thumbStoreFuture
          s3PngOption <- pngStoreFuture
          sourceDimensions <- sourceDimensionsFuture
          thumbDimensions <- thumbDimensionsFuture
          pngDimensions <- pngDimensionsFuture
          fileMetadata <- fileMetadataFuture
          colourModel <- colourModelFuture
          fullFileMetadata = fileMetadata.copy(colourModel = colourModel)

          metadata = ImageMetadataConverter.fromFileMetadata(fullFileMetadata)
          cleanMetadata = metadataCleaners.clean(metadata)

          sourceAsset = Asset.fromS3Object(s3Source, sourceDimensions)
          thumbAsset = Asset.fromS3Object(s3Thumb, thumbDimensions)
          pngAsset = if (uploadIsPng24)
            Some(Asset.fromS3Object(s3PngOption.get, pngDimensions))
          else
            None

          baseImage = createImage(uploadRequest, sourceAsset, thumbAsset, pngAsset, fullFileMetadata, cleanMetadata)
          processedImage = SupplierProcessors.process(baseImage)

          // FIXME: dirty hack to sync the originalUsageRights and originalMetadata as well
          finalImage = processedImage.copy(
            originalMetadata = processedImage.metadata,
            originalUsageRights = processedImage.usageRights
          )
        }
          yield {
            ImageUpload(uploadRequest, finalImage)
          }
      }
    }
  }.flatMap(f => f)

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
    Some("image/jpeg")
  )

  def storeOptimisedPng(uploadRequest: UploadRequest, optimisedPngFile: File) = ImageStore.storeOptimisedPng(
    uploadRequest.id,
    optimisedPngFile
  )

  private def createImage(uploadRequest: UploadRequest, source: Asset, thumbnail: Asset, png: Option[Asset],
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
      png,
      fileMetadata,
      None,
      metadata,
      metadata,
      usageRights,
      usageRights,
      List(),
      List()
    )
  }

  private def isPng24(mimeType: Option[String], fileMetadata: FileMetadata): Boolean =
    mimeType match {
      case Some("image/png") => fileMetadata.colourModelInformation.get("bitsPerSample").get == "16"
      case _ => false
    }

}
