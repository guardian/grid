package model

import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

import com.gu.mediaservice.lib.aws.S3Object
import com.gu.mediaservice.lib.cleanup.{MetadataCleaners, SupplierProcessors}
import com.gu.mediaservice.lib.config.MetadataConfig
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

object OptimisedPngOps {

  def build(file: File, uploadRequest: UploadRequest,
            fileMetadata: FileMetadata,
            config: ImageUploadOpsCfg,
            storeOrProject: (UploadRequest, File) => Future[S3Object])(implicit ec: ExecutionContext): OptimisedPng = {

    val shouldNotOptimise = !OptimisedPng.shouldOptimise(uploadRequest.mimeType, fileMetadata)
    if (shouldNotOptimise) return OptimisedPng(Future(None), isPng24 = false, None)

    val optimisedFile: File = toOptimisedFile(file, uploadRequest, config)

    val pngStoreFuture: Future[Option[S3Object]] = Some(storeOrProject(uploadRequest, optimisedFile))
      .map(result => result.map(Option(_)))
      .getOrElse(Future.successful(None))

    if (isTransformedFilePath(file.getAbsolutePath))
      file.delete

    OptimisedPng(pngStoreFuture, isPng24 = true, Some(optimisedFile))

  }

  private def toOptimisedFile(file: File, uploadRequest: UploadRequest, config: ImageUploadOpsCfg): File = {
    val optimisedFilePath = config.tempDir.getAbsolutePath + "/optimisedpng - " + uploadRequest.imageId + ".png"
    Seq("pngquant", "--quality", "1-85", file.getAbsolutePath, "--output", optimisedFilePath).!
    new File(optimisedFilePath)
  }

  private def isTransformedFilePath(filePath: String): Boolean = filePath.contains("transformed-")

}

case class ImageUpload(uploadRequest: UploadRequest, image: Image)

case object ImageUpload {
  val metadataCleaners = new MetadataCleaners(MetadataConfig.allPhotographersMap)

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

class ImageUploadOps(store: ImageLoaderStore,
                     config: ImageLoaderConfig,
                     imageOps: ImageOperations)(implicit val ec: ExecutionContext) {


  import ImageUploadOps.{fromUploadRequestShared, toMetaMap, toImageUploadOpsCfg}

  private val sideEffectDependencies = ImageUploadOpsDependencies(toImageUploadOpsCfg(config), imageOps,
    storeSource, storeThumbnail, storeOptimisedPng)

  def fromUploadRequest(uploadRequest: UploadRequest): Future[ImageUpload] = {
    val finalImage = fromUploadRequestShared(uploadRequest, sideEffectDependencies)
    finalImage.map(img => ImageUpload(uploadRequest, img))
  }

  private def storeSource(uploadRequest: UploadRequest) = {
    val meta = toMetaMap(uploadRequest)
    store.storeOriginal(
      uploadRequest.imageId,
      uploadRequest.tempFile,
      uploadRequest.mimeType,
      meta
    )
  }

  private def storeThumbnail(uploadRequest: UploadRequest, thumbFile: File) = store.storeThumbnail(
    uploadRequest.imageId,
    thumbFile,
    Some("image/jpeg")
  )

  private def storeOptimisedPng(uploadRequest: UploadRequest, optimisedPngFile: File) = {
    store.storeOptimisedPng(
      uploadRequest.imageId,
      optimisedPngFile
    )
  }
}

case class ImageUploadOpsCfg(tempDir: File,
                             thumbWidth: Int,
                             thumbQuality: Double,
                             transcodedMimeTypes: List[String],
                             originalFileBucket: String,
                             thumbBucket: String
                            )

case class ImageUploadOpsDependencies(config: ImageUploadOpsCfg,
                                      imageOps: ImageOperations,
                                      storeOrProjectOriginalFile: UploadRequest => Future[S3Object],
                                      storeOrProjectThumbFile: (UploadRequest, File) => Future[S3Object],
                                      storeOrProjectOptimisedPNG: (UploadRequest, File) => Future[S3Object]
                                     )

object ImageUploadOps {

  def toImageUploadOpsCfg(config: ImageLoaderConfig) = {
    ImageUploadOpsCfg(
      config.tempDir,
      config.thumbWidth,
      config.thumbQuality,
      config.transcodedMimeTypes,
      config.imageBucket,
      config.thumbnailBucket
    )
  }

  def fromUploadRequestShared(uploadRequest: UploadRequest,
                              deps: ImageUploadOpsDependencies)(implicit ec: ExecutionContext): Future[Image] = {

    import deps._

    Logger.info("Starting image ops")(uploadRequest.toLogMarker)
    val uploadedFile = uploadRequest.tempFile

    val fileMetadataFuture = toFileMetadata(uploadedFile, uploadRequest.imageId, uploadRequest.mimeType)

    val uploadMarkers = uploadRequest.toLogMarker
    Logger.info("Have read file headers")(uploadMarkers)

    fileMetadataFuture.flatMap(fileMetadata => {
      val markers: LogstashMarker = fileMetadata.toLogMarker.and(uploadMarkers)
      Logger.info("Have read file metadata")(markers)

      // These futures are started outside the for-comprehension, otherwise they will not run in parallel
      val sourceStoreFuture = storeOrProjectOriginalFile(uploadRequest)
      Logger.info("stored source file")(uploadRequest.toLogMarker)
      // FIXME: pass mimeType
      val colourModelFuture = ImageOperations.identifyColourModel(uploadedFile, "image/jpeg")
      val sourceDimensionsFuture = FileMetadataReader.dimensions(uploadedFile, uploadRequest.mimeType)

      val thumbFuture = createThumbFuture(fileMetadataFuture, colourModelFuture, uploadRequest, deps)

      Logger.info("thumbnail created")(uploadRequest.toLogMarker)

      //Could potentially use this file as the source file if needed (to generate thumbnail etc from)
      val optimiseFileFuture: Future[File] = createOptimisedFileFuture(uploadRequest, deps)

      optimiseFileFuture.flatMap(toOptimiseFile => {
        Logger.info("optimised image created")(uploadRequest.toLogMarker)

        val optimisedPng = OptimisedPngOps.build(toOptimiseFile, uploadRequest, fileMetadata, config, storeOrProjectOptimisedPNG)

        bracket(thumbFuture)(_.delete) { thumb =>
          // Run the operations in parallel
          val thumbStoreFuture = storeOrProjectThumbFile(uploadRequest, thumb)
          val thumbDimensionsFuture = FileMetadataReader.dimensions(thumb, Some("image/jpeg"))

          val finalImage = toFinalImage(
            sourceStoreFuture,
            thumbStoreFuture,
            sourceDimensionsFuture,
            thumbDimensionsFuture,
            fileMetadataFuture,
            colourModelFuture,
            optimisedPng,
            uploadRequest
          )

          finalImage
        }
      })
    })
  }

  def toMetaMap(uploadRequest: UploadRequest): Map[String, String] = {
    val baseMeta = Map(
      "uploaded_by" -> uploadRequest.uploadedBy,
      "upload_time" -> printDateTime(uploadRequest.uploadTime)
    ) ++ uploadRequest.identifiersMeta

    uploadRequest.uploadInfo.filename match {
      case Some(f) => baseMeta ++ Map("file_name" -> URLEncoder.encode(f, StandardCharsets.UTF_8.name()))
      case _ => baseMeta
    }
  }

  private def toFinalImage(sourceStoreFuture: Future[S3Object],
                           thumbStoreFuture: Future[S3Object],
                           sourceDimensionsFuture: Future[Option[Dimensions]],
                           thumbDimensionsFuture: Future[Option[Dimensions]],
                           fileMetadataFuture: Future[FileMetadata],
                           colourModelFuture: Future[Option[String]],
                           optimisedPng: OptimisedPng,
                           uploadRequest: UploadRequest)(implicit ec: ExecutionContext): Future[Image] = {
    for {
      s3Source <- sourceStoreFuture
      s3Thumb <- thumbStoreFuture
      s3PngOption <- optimisedPng.optimisedFileStoreFuture
      sourceDimensions <- sourceDimensionsFuture
      thumbDimensions <- thumbDimensionsFuture
      fileMetadata <- fileMetadataFuture
      colourModel <- colourModelFuture
      fullFileMetadata = fileMetadata.copy(colourModel = colourModel)

      metadata = ImageMetadataConverter.fromFileMetadata(fullFileMetadata)
      cleanMetadata = ImageUpload.metadataCleaners.clean(metadata)

      sourceAsset = Asset.fromS3Object(s3Source, sourceDimensions)
      thumbAsset = Asset.fromS3Object(s3Thumb, thumbDimensions)

      pngAsset = if (optimisedPng.isPng24)
        Some(Asset.fromS3Object(s3PngOption.get, sourceDimensions))
      else
        None

      baseImage = ImageUpload.createImage(uploadRequest, sourceAsset, thumbAsset, pngAsset, fullFileMetadata, cleanMetadata)
      processedImage = SupplierProcessors.process(baseImage)

      // FIXME: dirty hack to sync the originalUsageRights and originalMetadata as well
      finalImage = processedImage.copy(
        originalMetadata = processedImage.metadata,
        originalUsageRights = processedImage.usageRights
      )
    } yield {
      if (optimisedPng.isPng24) optimisedPng.optimisedTempFile.get.delete
      Logger.info("Ending image ops")(uploadRequest.toLogMarker)
      finalImage
    }
  }

  private def toFileMetadata(f: File, imageId: String, mimeType: Option[String]): Future[FileMetadata] = {
    mimeType match {
      case Some("image/png") => FileMetadataReader.fromICPTCHeadersWithColorInfo(f, imageId, mimeType.get)
      case Some("image/tiff") => FileMetadataReader.fromICPTCHeadersWithColorInfo(f, imageId, mimeType.get)
      case _ => FileMetadataReader.fromIPTCHeaders(f, imageId)
    }
  }

  private def createThumbFuture(fileMetadataFuture: Future[FileMetadata],
                                colourModelFuture: Future[Option[String]],
                                uploadRequest: UploadRequest,
                                deps: ImageUploadOpsDependencies)(implicit ec: ExecutionContext) = {
    import deps._
    for {
      fileMetadata <- fileMetadataFuture
      colourModel <- colourModelFuture
      iccColourSpace = FileMetadataHelper.normalisedIccColourSpace(fileMetadata)
      thumb <- imageOps
        .createThumbnail(uploadRequest.tempFile, uploadRequest.mimeType, config.thumbWidth,
          config.thumbQuality, config.tempDir, iccColourSpace, colourModel)
    } yield thumb
  }

  private def createOptimisedFileFuture(uploadRequest: UploadRequest,
                                        deps: ImageUploadOpsDependencies)(implicit ec: ExecutionContext) = {
    import deps._
    val uploadedFile = uploadRequest.tempFile
    uploadRequest.mimeType match {
      case Some(mime) => mime match {
        case transcodedMime if config.transcodedMimeTypes.contains(mime) =>
          for {
            transformedImage <- imageOps.transformImage(uploadedFile, uploadRequest.mimeType, config.tempDir)
          } yield transformedImage
        case _ =>
          Future.apply(uploadedFile)
      }
      case _ =>
        Future.apply(uploadedFile)
    }
  }

}



