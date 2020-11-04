package model

import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.aws.{S3Object, UpdateMessage}
import com.gu.mediaservice.lib.cleanup.{MetadataCleaners, SupplierProcessors}
import com.gu.mediaservice.lib.config.MetadataConfig
import com.gu.mediaservice.lib.formatting._
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.lib.metadata.{FileMetadataHelper, ImageMetadataConverter}
import com.gu.mediaservice.lib.resource.FutureResources._
import com.gu.mediaservice.model._
import lib.{DigestedFile, ImageLoaderConfig, Notifications}
import lib.imaging.{FileMetadataReader, MimeTypeDetection}
import lib.storage.ImageLoaderStore
import org.joda.time.DateTime
import play.api.libs.json.{JsObject, Json}

import scala.concurrent.{ExecutionContext, Future}
import scala.sys.process._

case class OptimisedPng(optimisedFileStoreFuture: Future[Option[S3Object]], isPng24: Boolean,
                        optimisedTempFile: Option[File])

case object OptimisedPng {

  def shouldOptimise(mimeType: Option[MimeType], fileMetadata: FileMetadata): Boolean =
    mimeType match {
      case Some(Png) =>
        fileMetadata.colourModelInformation.get("colorType") match {
          case Some("True Color") => true
          case Some("True Color with Alpha") => true
          case _ => false
        }
      case Some(Tiff) => true
      case _ => false
    }
}

object OptimisedPngOps {

  def build(file: File,
            uploadRequest: UploadRequest,
            fileMetadata: FileMetadata,
            config: ImageUploadOpsCfg,
            storeOrProject: (UploadRequest, File) => Future[S3Object])
           (implicit ec: ExecutionContext, logMarker: LogMarker): OptimisedPng = {

    val result = if (!OptimisedPng.shouldOptimise(uploadRequest.mimeType, fileMetadata)) {
      OptimisedPng(Future(None), isPng24 = false, None)
    } else {
      val optimisedFile: File = toOptimisedFile(file, uploadRequest, config)
      val pngStoreFuture: Future[Option[S3Object]] = Some(storeOrProject(uploadRequest, optimisedFile))
        .map(result => result.map(Option(_)))
        .getOrElse(Future.successful(None))
      if (isTransformedFilePath(file.getAbsolutePath))
        file.delete
      OptimisedPng(pngStoreFuture, isPng24 = true, Some(optimisedFile))
    }
    result
  }

  private def toOptimisedFile(file: File, uploadRequest: UploadRequest, config: ImageUploadOpsCfg)
                             (implicit logMarker: LogMarker): File = {
    val optimisedFilePath = config.tempDir.getAbsolutePath + "/optimisedpng - " + uploadRequest.imageId + ".png"
    Stopwatch("pngquant") {
      Seq("pngquant", "--quality", "1-85", file.getAbsolutePath, "--output", optimisedFilePath).!
    }
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

class Uploader(val store: ImageLoaderStore,
               val config: ImageLoaderConfig,
               val imageOps: ImageOperations,
               val notifications: Notifications)
              (implicit val ec: ExecutionContext) extends ArgoHelpers {


  import Uploader.{fromUploadRequestShared, toMetaMap, toImageUploadOpsCfg}


  def fromUploadRequest(uploadRequest: UploadRequest)
                       (implicit logMarker: LogMarker): Future[ImageUpload] = {
    val sideEffectDependencies = ImageUploadOpsDependencies(toImageUploadOpsCfg(config), imageOps,
      storeSource, storeThumbnail, storeOptimisedPng)
    val finalImage = fromUploadRequestShared(uploadRequest, sideEffectDependencies)
    finalImage.map(img => Stopwatch("finalImage"){ImageUpload(uploadRequest, img)})
  }

  private def storeSource(uploadRequest: UploadRequest)
                         (implicit logMarker: LogMarker) = {
    val meta = toMetaMap(uploadRequest)
    store.storeOriginal(
      uploadRequest.imageId,
      uploadRequest.tempFile,
      uploadRequest.mimeType,
      meta
    )
  }

  private def storeThumbnail(uploadRequest: UploadRequest, thumbFile: File)
                            (implicit logMarker: LogMarker) = store.storeThumbnail(
    uploadRequest.imageId,
    thumbFile,
    Some(Jpeg)
  )

  private def storeOptimisedPng(uploadRequest: UploadRequest, optimisedPngFile: File)
                               (implicit logMarker: LogMarker) = {
    store.storeOptimisedPng(
      uploadRequest.imageId,
      optimisedPngFile
    )
  }

  def loadFile(digestedFile: DigestedFile,
               user: Principal,
               uploadedBy: Option[String],
               identifiers: Option[String],
               uploadTime: DateTime,
               filename: Option[String],
               requestId: UUID)
              (implicit ec:ExecutionContext,
               logMarker: LogMarker): Future[UploadRequest] = Future {
    val DigestedFile(tempFile, id) = digestedFile

    // TODO: should error if the JSON parsing failed
    val identifiersMap = identifiers.map(Json.parse(_).as[Map[String, String]]) getOrElse Map()

    MimeTypeDetection.guessMimeType(tempFile) match {
      case util.Left(unsupported) =>
        logger.error(s"Unsupported mimetype", unsupported)
        throw unsupported
      case util.Right(mimeType) =>
        logger.info(s"Detected mimetype as $mimeType")
        UploadRequest(
          requestId = requestId,
          imageId = id,
          tempFile = tempFile,
          mimeType = Some(mimeType),
          uploadTime = uploadTime,
          uploadedBy = uploadedBy.getOrElse(Authentication.getIdentity(user)),
          identifiers = identifiersMap,
          uploadInfo = UploadInfo(filename)
        )
    }
  }

  def storeFile(uploadRequest: UploadRequest)
               (implicit ec:ExecutionContext,
                logMarker: LogMarker): Future[JsObject] = {

    logger.info("Storing file")

    for {
      imageUpload <- fromUploadRequest(uploadRequest)
      updateMessage = UpdateMessage(subject = "image", image = Some(imageUpload.image))
      _ <- Future { notifications.publish(updateMessage) }
      // TODO: centralise where all these URLs are constructed
      uri = s"${config.apiUri}/images/${uploadRequest.imageId}"
    } yield {
      Json.obj("uri" -> uri)
    }

  }

}

case class ImageUploadOpsCfg(
  tempDir: File,
  thumbWidth: Int,
  thumbQuality: Double,
  transcodedMimeTypes: List[MimeType],
  originalFileBucket: String,
  thumbBucket: String
)

case class ImageUploadOpsDependencies(
  config: ImageUploadOpsCfg,
  imageOps: ImageOperations,
  storeOrProjectOriginalFile: UploadRequest => Future[S3Object],
  storeOrProjectThumbFile: (UploadRequest, File) => Future[S3Object],
  storeOrProjectOptimisedPNG: (UploadRequest, File) => Future[S3Object]
)

object Uploader extends GridLogging {

  def toImageUploadOpsCfg(config: ImageLoaderConfig): ImageUploadOpsCfg = {
    ImageUploadOpsCfg(
      config.tempDir,
      config.thumbWidth,
      config.thumbQuality,
      config.transcodedMimeTypes,
      config.imageBucket,
      config.thumbnailBucket
    )
  }

  def fromUploadRequestShared(uploadRequest: UploadRequest, deps: ImageUploadOpsDependencies)
                             (implicit ec: ExecutionContext, logMarker: LogMarker): Future[Image] = {

    import deps._

    logger.info("Starting image ops")
    val uploadedFile = uploadRequest.tempFile

    val fileMetadataFuture = toFileMetadata(uploadedFile, uploadRequest.imageId, uploadRequest.mimeType)

    logger.info("Have read file headers")

    fileMetadataFuture.flatMap(fileMetadata => {
      uploadAndStoreImage(config,
        storeOrProjectOriginalFile,
        storeOrProjectThumbFile,
        storeOrProjectOptimisedPNG,
        uploadRequest,
        deps,
        uploadedFile,
        fileMetadataFuture,
        fileMetadata)(ec, addLogMarkers(fileMetadata.toLogMarker))
    })
  }

  private def uploadAndStoreImage(config: ImageUploadOpsCfg,
                   storeOrProjectOriginalFile: UploadRequest => Future[S3Object],
                   storeOrProjectThumbFile: (UploadRequest, File) => Future[S3Object],
                   storeOrProjectOptimisedPNG: (UploadRequest, File) => Future[S3Object],
                   uploadRequest: UploadRequest,
                   deps: ImageUploadOpsDependencies,
                   uploadedFile: File,
                   fileMetadataFuture: Future[FileMetadata],
                   fileMetadata: FileMetadata)
                  (implicit ec: ExecutionContext, logMarker: LogMarker) = {
    logger.info("Have read file metadata")
    logger.info("stored source file")
    // FIXME: pass mimeType
    val colourModelFuture = ImageOperations.identifyColourModel(uploadedFile, Jpeg)
    val sourceDimensionsFuture = FileMetadataReader.dimensions(uploadedFile, uploadRequest.mimeType)

    // if the file needs pre-processing into a supported type of file, do it now and create the new upload request.
    createOptimisedFileFuture(uploadRequest, deps).flatMap(uploadRequest => {
      val sourceStoreFuture = storeOrProjectOriginalFile(uploadRequest)
      val toOptimiseFile = uploadRequest.tempFile
      val thumbFuture = createThumbFuture(fileMetadataFuture, colourModelFuture, uploadRequest, deps)
      logger.info("thumbnail created")

      val optimisedPng = OptimisedPngOps.build(
        toOptimiseFile,
        uploadRequest,
        fileMetadata,
        config,
        storeOrProjectOptimisedPNG)(ec, logMarker)
      logger.info(s"optimised image ($toOptimiseFile) created")

      bracket(thumbFuture)(_.delete) { thumb =>
        // Run the operations in parallel
        val thumbStoreFuture = storeOrProjectThumbFile(uploadRequest, thumb)
        val thumbDimensionsFuture = FileMetadataReader.dimensions(thumb, Some(Jpeg))

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
        logger.info(s"Deleting temp file ${uploadedFile.getAbsolutePath}")
        uploadedFile.delete()
        toOptimiseFile.delete()

        finalImage
      }
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
                           uploadRequest: UploadRequest)
                          (implicit ec: ExecutionContext, logMarker: LogMarker): Future[Image] = {
    logger.info("Starting image ops")
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
      logger.info("Ending image ops")
      finalImage
    }
  }

  private def toFileMetadata(f: File, imageId: String, mimeType: Option[MimeType]): Future[FileMetadata] = {
    mimeType match {
      case Some(Png | Tiff) => FileMetadataReader.fromICPTCHeadersWithColorInfo(f, imageId, mimeType.get)
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
                                        deps: ImageUploadOpsDependencies)(implicit ec: ExecutionContext): Future[UploadRequest] = {
    import deps._
    uploadRequest.mimeType match {
      case Some(mime) if config.transcodedMimeTypes.contains(mime) =>
        for {
          transformedImage <- imageOps.transformImage(uploadRequest.tempFile, uploadRequest.mimeType, config.tempDir)
        } yield uploadRequest
          // This file has been converted.
          .copy(mimeType = Some(Jpeg))
          .copy(tempFile = transformedImage)
      case _ =>
        Future.successful(uploadRequest)
    }
  }


}



