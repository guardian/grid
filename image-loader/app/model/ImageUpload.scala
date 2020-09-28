package model

import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

import com.gu.mediaservice.lib.aws.S3Object
import com.gu.mediaservice.lib.cleanup.{MetadataCleaners, SupplierProcessors}
import com.gu.mediaservice.lib.config.{MetadataStore, UsageRightsStore}
import com.gu.mediaservice.lib.formatting._
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.metadata.{FileMetadataHelper, ImageMetadataConverter}
import com.gu.mediaservice.lib.resource.FutureResources._
import com.gu.mediaservice.model._
import lib.ImageLoaderConfig
import lib.imaging.FileMetadataReader
import lib.storage.ImageLoaderStore
import net.logstash.logback.marker.LogstashMarker
import play.api.Logger

import scala.concurrent.{ExecutionContext, Future}
import scala.sys.process._

case class OptimisedPng(optimisedFileStoreFuture: Future[Option[S3Object]], isPng24: Boolean,
                        optimisedTempFile: Option[File])

case object OptimisedPng {

  def shouldOptimise(mimeType: Option[String], fileMetadata: FileMetadata): Boolean =
    mimeType match {
      case Some("image/png") =>
        fileMetadata.colourModelInformation.get("colorType") match {
          case Some("True Color") => true
          case Some("True Color with Alpha") => true
          case _ => false
        }
      case Some("image/tiff") => true
      case _ => false
    }
}

class OptimisedPngOps(store: ImageLoaderStore, config: ImageLoaderConfig)(implicit val ec: ExecutionContext) {
  private def storeOptimisedPng(uploadRequest: UploadRequest, optimisedPngFile: File) = store.storeOptimisedPng(
    uploadRequest.imageId,
    optimisedPngFile
  )

  private def isTransformedFilePath(filePath: String) = filePath.contains("transformed-")

  def build (file: File, uploadRequest: UploadRequest, fileMetadata: FileMetadata, speed: Double = 4): OptimisedPng = {
    if (OptimisedPng.shouldOptimise(uploadRequest.mimeType, fileMetadata)) {

      val optimisedFile = {
        val optimisedFilePath = config.tempDir.getAbsolutePath + "/optimisedpng-" + uploadRequest.imageId + ".png"
        Seq("pngquant", "--quality", "1-85", "--speed", speed.toString, file.getAbsolutePath, "--output", optimisedFilePath).!
        new File(optimisedFilePath)
      }
      if (isTransformedFilePath(file.getAbsolutePath)) {
        file.delete
      }

      if(optimisedFile.exists()) {  //may fail due to poor quality
        val pngStoreFuture: Future[Option[S3Object]] = Some(storeOptimisedPng(uploadRequest, optimisedFile))
          .map(result => result.map(Option(_)))
          .getOrElse(Future.successful(None))

        return OptimisedPng(pngStoreFuture, isPng24 = true, Some(optimisedFile))
      } else {
        Logger.warn("Failed to pngquant optimise image")(uploadRequest.toLogMarker)
      }
    }
    OptimisedPng(Future(None), isPng24 = false, None)
  }
}

case class ImageUpload(uploadRequest: UploadRequest, image: Image)
case object ImageUpload {

  def createImage(uploadRequest: UploadRequest, source: Asset, thumbnail: Asset, png: Option[Asset],
                  fileMetadata: FileMetadata, metadata: ImageMetadata): Image = {
    val usageRights = NoRights
    Image(
      uploadRequest.imageId,
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
}

class ImageUploadOps(metadataStore: MetadataStore,
                     usageRightsStore: UsageRightsStore,
                     loaderStore: ImageLoaderStore,
                     config: ImageLoaderConfig,
                     imageOps: ImageOperations,
                     optimisedPngOps: OptimisedPngOps)(implicit val ec: ExecutionContext) {
  def fromUploadRequest(uploadRequest: UploadRequest): Future[ImageUpload] = {
    Logger.info("Starting image ops")(uploadRequest.toLogMarker)
    val uploadedFile = uploadRequest.tempFile

    val fileMetadataFuture = uploadRequest.mimeType match {
      case Some("image/png") => FileMetadataReader.fromICPTCHeadersWithColorInfo(uploadedFile, uploadRequest.imageId, uploadRequest.mimeType.get)
      case Some("image/tiff") => FileMetadataReader.fromICPTCHeadersWithColorInfo(uploadedFile, uploadRequest.imageId, uploadRequest.mimeType.get)
      case _ => FileMetadataReader.fromIPTCHeaders(uploadedFile, uploadRequest.imageId)
    }
    val uploadMarkers = uploadRequest.toLogMarker
    Logger.info("Have read file headers")(uploadMarkers)

    fileMetadataFuture.flatMap(fileMetadata => {
      val markers: LogstashMarker = fileMetadata.toLogMarker.and(uploadMarkers)
      Logger.info("Have read file metadata")(markers)

      // These futures are started outside the for-comprehension, otherwise they will not run in parallel
      val sourceStoreFuture = storeSource(uploadRequest)
      Logger.info("stored source file")(uploadRequest.toLogMarker)
      // FIXME: pass mimeType
      val colourModelFuture = ImageOperations.identifyColourModel(uploadedFile, "image/jpeg")
      val sourceDimensionsFuture = FileMetadataReader.dimensions(uploadedFile, uploadRequest.mimeType)

      val thumbFuture = for {
        fileMetadata <- fileMetadataFuture
        colourModel <- colourModelFuture
        iccColourSpace = FileMetadataHelper.normalisedIccColourSpace(fileMetadata)
        thumb <- imageOps.createThumbnail(uploadedFile, uploadRequest.mimeType, config.thumbWidth, config.thumbQuality, config.tempDir, iccColourSpace, colourModel)
      } yield thumb

      Logger.info("thumbnail created")(uploadRequest.toLogMarker)

      //Could potentially use this file as the source file if needed (to generate thumbnail etc from)
      val toOptimiseFileFuture: Future[File] = uploadRequest.mimeType match {
        case Some(mime) => mime match {
          case transcodedMime if config.transcodedMimeTypes.contains(mime) =>
            for {
              transformedImage <- imageOps.transformImage(uploadedFile, uploadRequest.mimeType, config.tempDir, config.transcodedOptimisedQuality)
            } yield transformedImage
          case _ =>
            Future.apply(uploadedFile)
        }
        case _ =>
          Future.apply(uploadedFile)
      }

      toOptimiseFileFuture.flatMap(toOptimiseFile => {
        Logger.info("optimised image created")(uploadRequest.toLogMarker)

        val optimisedPng = optimisedPngOps.build(toOptimiseFile, uploadRequest, fileMetadata, config.optimiseSpeed)

        bracket(thumbFuture)(_.delete) { thumb =>
          // Run the operations in parallel
          val thumbStoreFuture = storeThumbnail(uploadRequest, thumb)
          val thumbDimensionsFuture = FileMetadataReader.dimensions(thumb, Some("image/jpeg"))

          for {
            s3Source <- sourceStoreFuture
            s3Thumb <- thumbStoreFuture
            s3PngOption <- optimisedPng.optimisedFileStoreFuture
            sourceDimensions <- sourceDimensionsFuture
            thumbDimensions <- thumbDimensionsFuture
            fileMetadata <- fileMetadataFuture
            colourModel <- colourModelFuture
            fullFileMetadata = fileMetadata.copy(colourModel = colourModel)

            metaDataConfig = metadataStore.get
            metadataCleaners = new MetadataCleaners(metaDataConfig.allPhotographers)
            metadata = ImageMetadataConverter.fromFileMetadata(fullFileMetadata)
            cleanMetadata = metadataCleaners.clean(metadata)

            sourceAsset = Asset.fromS3Object(s3Source, sourceDimensions)
            thumbAsset = Asset.fromS3Object(s3Thumb, thumbDimensions)

            pngAsset = if (optimisedPng.isPng24)
              Some(Asset.fromS3Object(s3PngOption.get, sourceDimensions))
            else
              None

            usageRightsConfig = usageRightsStore.get

            baseImage = ImageUpload.createImage(uploadRequest, sourceAsset, thumbAsset, pngAsset, fullFileMetadata, cleanMetadata)
            processedImage = new SupplierProcessors(metaDataConfig).process(baseImage, usageRightsConfig)

            // FIXME: dirty hack to sync the originalUsageRights and originalMetadata as well
            finalImage = processedImage.copy(
              originalMetadata = processedImage.metadata,
              originalUsageRights = processedImage.usageRights
            )
          } yield {
            if (optimisedPng.isPng24) optimisedPng.optimisedTempFile.get.delete
            Logger.info("Ending image ops")(uploadRequest.toLogMarker)
            ImageUpload(uploadRequest, finalImage)
          }
        }
      })
    })
  }

  def storeSource(uploadRequest: UploadRequest) = {
    val baseMeta = Map(
      "uploaded_by" -> uploadRequest.uploadedBy,
      "upload_time" -> printDateTime(uploadRequest.uploadTime)
    ) ++ uploadRequest.identifiersMeta

    val meta = uploadRequest.uploadInfo.filename match {
      case Some(f) => baseMeta ++ Map("file_name" -> URLEncoder.encode(f, StandardCharsets.UTF_8.name()))
      case _ => baseMeta
    }

    loaderStore.storeOriginal(
      uploadRequest.imageId,
      uploadRequest.tempFile,
      uploadRequest.mimeType,
      meta
    )
  }
  def storeThumbnail(uploadRequest: UploadRequest, thumbFile: File) = loaderStore.storeThumbnail(
    uploadRequest.imageId,
    thumbFile,
    Some("image/jpeg")
  )
}
