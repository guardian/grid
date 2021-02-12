package model

import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.UUID
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.{BrowserViewableImage, ImageStorageProps, StorableOptimisedImage, StorableOriginalImage, StorableThumbImage}
import com.gu.mediaservice.lib.aws.{S3Object, UpdateMessage}
import com.gu.mediaservice.lib.cleanup.{ImageProcessor, MetadataCleaners, SupplierProcessors}
import com.gu.mediaservice.lib.config.MetadataConfig
import com.gu.mediaservice.lib.formatting._
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.lib.metadata.{FileMetadataHelper, ImageMetadataConverter}
import com.gu.mediaservice.lib.net.URI
import com.gu.mediaservice.model._
import lib.{DigestedFile, ImageLoaderConfig, Notifications}
import lib.imaging.{FileMetadataReader, MimeTypeDetection}
import lib.storage.ImageLoaderStore
import model.Uploader.{fromUploadRequestShared, toImageUploadOpsCfg}
import model.upload.{OptimiseOps, OptimiseWithPngQuant, UploadRequest}
import org.joda.time.DateTime
import play.api.libs.json.{JsObject, Json}

import scala.concurrent.{ExecutionContext, Future}

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
                                       storeOrProjectOriginalFile: StorableOriginalImage => Future[S3Object],
                                       storeOrProjectThumbFile: StorableThumbImage => Future[S3Object],
                                       storeOrProjectOptimisedImage: StorableOptimisedImage => Future[S3Object]
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

  def fromUploadRequestShared(uploadRequest: UploadRequest, deps: ImageUploadOpsDependencies, processor: ImageProcessor)
                             (implicit ec: ExecutionContext, logMarker: LogMarker): Future[Image] = {

    import deps._

    logger.info("Starting image ops")

    val fileMetadataFuture = toFileMetadata(uploadRequest.tempFile, uploadRequest.imageId, uploadRequest.mimeType)

    logger.info("Have read file headers")

    fileMetadataFuture.flatMap(fileMetadata => {
      uploadAndStoreImage(
        storeOrProjectOriginalFile,
        storeOrProjectThumbFile,
        storeOrProjectOptimisedImage,
        OptimiseWithPngQuant,
        uploadRequest,
        deps,
        fileMetadata,
        processor)(ec, addLogMarkers(fileMetadata.toLogMarker))
    })
  }

  private[model] def uploadAndStoreImage(storeOrProjectOriginalFile: StorableOriginalImage => Future[S3Object],
                                         storeOrProjectThumbFile: StorableThumbImage => Future[S3Object],
                                         storeOrProjectOptimisedFile: StorableOptimisedImage => Future[S3Object],
                                         optimiseOps: OptimiseOps,
                                         uploadRequest: UploadRequest,
                                         deps: ImageUploadOpsDependencies,
                                         fileMetadata: FileMetadata,
                                         processor: ImageProcessor)
                  (implicit ec: ExecutionContext, logMarker: LogMarker) = {
    val originalMimeType = uploadRequest.mimeType
      .orElse(MimeTypeDetection.guessMimeType(uploadRequest.tempFile).toOption)
    match {
      case Some(a) => a
      case None => throw new Exception("File of unknown and undetectable mime type")
    }

    val makeNewDirInTempDirHere: File = Files.createTempDirectory(deps.config.tempDir.toPath, "upload").toFile

    val colourModelFuture = ImageOperations.identifyColourModel(uploadRequest.tempFile, originalMimeType)
    val sourceDimensionsFuture = FileMetadataReader.dimensions(uploadRequest.tempFile, Some(originalMimeType))

    val storableOriginalImage = StorableOriginalImage(
      uploadRequest.imageId,
      uploadRequest.tempFile,
      originalMimeType,
      toMetaMap(uploadRequest)
    )
    val sourceStoreFuture = storeOrProjectOriginalFile(storableOriginalImage)
    val eventualBrowserViewableImage = createBrowserViewableFileFuture(uploadRequest, makeNewDirInTempDirHere, deps)


    val eventualImage = for {
      browserViewableImage <- eventualBrowserViewableImage
      s3Source <- sourceStoreFuture
      optimisedFileMetadata <- FileMetadataReader.fromIPTCHeadersWithColorInfo(browserViewableImage)
      thumbViewableImage <- createThumbFuture(optimisedFileMetadata, colourModelFuture, browserViewableImage, deps)
      s3Thumb <- storeOrProjectThumbFile(thumbViewableImage)
      maybeStorableOptimisedImage <- getStorableOptimisedImage(makeNewDirInTempDirHere, optimiseOps, browserViewableImage, optimisedFileMetadata)
      s3PngOption <- maybeStorableOptimisedImage match {
        case Some(storableOptimisedImage) => storeOrProjectOptimisedFile(storableOptimisedImage).map(a=>Some(a))
        case None => Future.successful(None)
      }
      sourceDimensions <- sourceDimensionsFuture
      thumbDimensions <- FileMetadataReader.dimensions(thumbViewableImage.file, Some(Jpeg))
      colourModel <- colourModelFuture
    } yield {
      val fullFileMetadata = fileMetadata.copy(colourModel = colourModel)
      val metadata = ImageMetadataConverter.fromFileMetadata(fullFileMetadata, s3Source.metadata.objectMetadata.lastModified)

      val sourceAsset = Asset.fromS3Object(s3Source, sourceDimensions)
      val thumbAsset = Asset.fromS3Object(s3Thumb, thumbDimensions)

      val pngAsset = s3PngOption.map(Asset.fromS3Object(_, sourceDimensions))
      val baseImage = ImageUpload.createImage(uploadRequest, sourceAsset, thumbAsset, pngAsset, fullFileMetadata, metadata)

      val processedImage = processor(baseImage)

      logger.info("Ending image ops")
      // FIXME: dirty hack to sync the originalUsageRights and originalMetadata as well
      processedImage.copy(
        originalMetadata = processedImage.metadata,
        originalUsageRights = processedImage.usageRights
      )
    }
    eventualImage.onComplete{ _ =>
      makeNewDirInTempDirHere.listFiles().map(f => f.delete())
      makeNewDirInTempDirHere.delete()
    }
    eventualImage
  }

  private def getStorableOptimisedImage(
                                         tempDir: File,
                                         optimiseOps: OptimiseOps,
                                         browserViewableImage: BrowserViewableImage,
                                         optimisedFileMetadata: FileMetadata)
           (implicit ec: ExecutionContext, logMarker: LogMarker): Future[Option[StorableOptimisedImage]] = {
    if (optimiseOps.shouldOptimise(Some(browserViewableImage.mimeType), optimisedFileMetadata)) {
      for {
        (optimisedFile: File, optimisedMimeType: MimeType) <- optimiseOps.toOptimisedFile(browserViewableImage.file, browserViewableImage, tempDir)
      } yield Some(browserViewableImage.copy(file = optimisedFile).copy(mimeType = optimisedMimeType).asStorableOptimisedImage)
    } else if (browserViewableImage.mustUpload) {
      Future.successful(Some(browserViewableImage.asStorableOptimisedImage))
    } else
      Future.successful(None)
  }

  def toMetaMap(uploadRequest: UploadRequest): Map[String, String] = {
    val baseMeta = Map(
      ImageStorageProps.uploadedByMetadataKey -> uploadRequest.uploadedBy,
      ImageStorageProps.uploadTimeMetadataKey -> printDateTime(uploadRequest.uploadTime)
    ) ++
      uploadRequest.identifiersMeta ++
      uploadRequest.uploadInfo.filename.map(ImageStorageProps.filenameMetadataKey -> _)

    baseMeta.mapValues(URI.encode)
  }

  private def toFileMetadata(f: File, imageId: String, mimeType: Option[MimeType]): Future[FileMetadata] = {
    mimeType match {
      case Some(Png | Tiff) => FileMetadataReader.fromIPTCHeadersWithColorInfo(f, imageId, mimeType.get)
      case _ => FileMetadataReader.fromIPTCHeaders(f, imageId)
    }
  }

  private def createThumbFuture(fileMetadata: FileMetadata,
                                colourModelFuture: Future[Option[String]],
                                browserViewableImage: BrowserViewableImage,
                                deps: ImageUploadOpsDependencies)(implicit ec: ExecutionContext) = {
    import deps._
    for {
      colourModel <- colourModelFuture
      iccColourSpace = FileMetadataHelper.normalisedIccColourSpace(fileMetadata)
      (thumb, thumbMimeType) <- imageOps
        .createThumbnail(browserViewableImage.file, Some(browserViewableImage.mimeType), config.thumbWidth,
          config.thumbQuality, config.tempDir, iccColourSpace, colourModel)
    } yield browserViewableImage
      .copy(file = thumb, mimeType = thumbMimeType)
      .asStorableThumbImage
  }

  private def createBrowserViewableFileFuture(uploadRequest: UploadRequest,
                                              tempDir: File,
                                        deps: ImageUploadOpsDependencies)(implicit ec: ExecutionContext): Future[BrowserViewableImage] = {
    import deps._
    uploadRequest.mimeType match {
      case Some(mime) if config.transcodedMimeTypes.contains(mime) =>
        for {
          (file, mimeType) <- imageOps.transformImage(uploadRequest.tempFile, uploadRequest.mimeType, tempDir)
        } yield BrowserViewableImage(
          uploadRequest.imageId,
          file = file,
          mimeType = mimeType,
          mustUpload = true
        )
      case Some(mimeType) =>
        Future.successful(
          BrowserViewableImage(
            uploadRequest.imageId,
            file = uploadRequest.tempFile,
            mimeType = mimeType)
        )
      case None => Future.failed(new Exception("This file is not an image with an identifiable mime type"))
    }
  }
}

class Uploader(val store: ImageLoaderStore,
               val config: ImageLoaderConfig,
               val imageOps: ImageOperations,
               val notifications: Notifications)
              (implicit val ec: ExecutionContext) extends ArgoHelpers {




  def fromUploadRequest(uploadRequest: UploadRequest)
                       (implicit logMarker: LogMarker): Future[ImageUpload] = {
    val sideEffectDependencies = ImageUploadOpsDependencies(toImageUploadOpsCfg(config), imageOps,
      storeSource, storeThumbnail, storeOptimisedImage)
    val finalImage = fromUploadRequestShared(uploadRequest, sideEffectDependencies, config.imageProcessor)
    finalImage.map(img => Stopwatch("finalImage"){ImageUpload(uploadRequest, img)})
  }

  private def storeSource(storableOriginalImage: StorableOriginalImage)
                         (implicit logMarker: LogMarker) = store.store(storableOriginalImage)

  private def storeThumbnail(storableThumbImage: StorableThumbImage)
                            (implicit logMarker: LogMarker) = store.store(storableThumbImage)

  private def storeOptimisedImage(storableOptimisedImage: StorableOptimisedImage)
                                 (implicit logMarker: LogMarker) = store.store(storableOptimisedImage)

  def loadFile(digestedFile: DigestedFile,
               uploadedBy: String,
               identifiers: Option[String],
               uploadTime: DateTime,
               filename: Option[String],
               requestId: UUID)
              (implicit ec:ExecutionContext,
               logMarker: LogMarker): Future[UploadRequest] = Future {
    val DigestedFile(tempFile, id) = digestedFile

    // TODO: should error if the JSON parsing failed
    val identifiersMap = identifiers
      .map(Json.parse(_).as[Map[String, String]])
      .getOrElse(Map.empty)
      .mapValues(_.toLowerCase)

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
          uploadedBy = uploadedBy,
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

