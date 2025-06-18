package model

import com.gu.mediaservice.{GridClient, ImageDataMerger}
import com.gu.mediaservice.lib.Files.createTempFile

import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import java.util.UUID
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.{BrowserViewableImage, ImageStorageProps, StorableOptimisedImage, StorableOriginalImage, StorableThumbImage}
import com.gu.mediaservice.lib.aws.{S3Object, UpdateMessage}
import com.gu.mediaservice.lib.cleanup.ImageProcessor
import com.gu.mediaservice.lib.formatting._
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.imaging.ImageOperations.{optimisedMimeType, thumbMimeType}
import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.lib.metadata.{FileMetadataHelper, ImageMetadataConverter}
import com.gu.mediaservice.lib.net.URI
import com.gu.mediaservice.model._
import com.gu.mediaservice.syntax.MessageSubjects
import lib.{DigestedFile, ImageLoaderConfig, Notifications}
import lib.imaging.{FileMetadataReader, MimeTypeDetection}
import lib.storage.ImageLoaderStore
import model.Uploader.{fromUploadRequestShared, toImageUploadOpsCfg}
import model.upload.{OptimiseOps, OptimiseWithPngQuant, UploadRequest}
import org.joda.time.DateTime
import play.api.libs.json.{JsObject, Json}
import play.api.libs.ws.WSRequest

import scala.collection.compat._
import scala.concurrent.{ExecutionContext, Future}

case class ImageUpload(uploadRequest: UploadRequest, image: Image)

case object ImageUpload {

  def createImage(uploadRequest: UploadRequest, source: Asset, thumbnail: Asset, png: Option[Asset],
                  fileMetadata: FileMetadata, metadata: ImageMetadata): Image = {
    val usageRights = NoRights
    Image(
      uploadRequest.imageId,
      uploadRequest.uploadTime,
      uploadRequest.uploadedBy,
      None,
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
  storeOrProjectOptimisedImage: StorableOptimisedImage => Future[S3Object],
  tryFetchThumbFile: (String, File) => Future[Option[(File, MimeType)]] = (_, _) => Future.successful(None),
  tryFetchOptimisedFile: (String, File) => Future[Option[(File, MimeType)]] = (_, _) => Future.successful(None),
)

case class UploadStatusUri (uri: String) extends AnyVal {
  def toJsObject = Json.obj("uri" -> uri)
}

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

    logger.info(logMarker, "Starting image ops")

    val fileMetadataFuture = toFileMetadata(uploadRequest.tempFile, uploadRequest.imageId, uploadRequest.mimeType)

    logger.info(logMarker, "Have read file headers")

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

    val tempDirForRequest: File = Files.createTempDirectory(deps.config.tempDir.toPath, "upload").toFile

    val colourModelFuture = ImageOperations.identifyColourModel(uploadRequest.tempFile, originalMimeType)
    val sourceDimensionsFuture = FileMetadataReader.dimensions(uploadRequest.tempFile, Some(originalMimeType))
    val sourceOrientationMetadataFuture = FileMetadataReader.orientation(uploadRequest.tempFile)

    val storableOriginalImage = StorableOriginalImage(
      uploadRequest.imageId,
      uploadRequest.tempFile,
      originalMimeType,
      uploadRequest.uploadTime,
      toMetaMap(uploadRequest)
    )
    val sourceStoreFuture = storeOrProjectOriginalFile(storableOriginalImage)
    val eventualBrowserViewableImage = createBrowserViewableFileFuture(uploadRequest, tempDirForRequest, deps)

    val eventualImage = for {
      browserViewableImage <- eventualBrowserViewableImage
      s3Source <- sourceStoreFuture
      mergedUploadRequest = patchUploadRequestWithS3Metadata(uploadRequest, s3Source)
      optimisedFileMetadata <- FileMetadataReader.fromIPTCHeadersWithColorInfo(browserViewableImage)
      sourceDimensions <- sourceDimensionsFuture
      sourceOrientationMetadata <- sourceOrientationMetadataFuture
      thumbViewableImage <- createThumbFuture(optimisedFileMetadata, colourModelFuture, browserViewableImage, deps, tempDirForRequest, orientationMetadata = sourceOrientationMetadata)
      s3Thumb <- storeOrProjectThumbFile(thumbViewableImage)
      maybeStorableOptimisedImage <- getStorableOptimisedImage(
        tempDirForRequest, optimiseOps, browserViewableImage, optimisedFileMetadata, deps.tryFetchOptimisedFile)
      s3PngOption <- maybeStorableOptimisedImage match {
        case Some(storableOptimisedImage) => storeOrProjectOptimisedFile(storableOptimisedImage).map(a=>Some(a))
        case None => Future.successful(None)
      }
      thumbDimensions <- FileMetadataReader.dimensions(thumbViewableImage.file, Some(thumbViewableImage.mimeType))
      colourModel <- colourModelFuture
    } yield {
      val fullFileMetadata = fileMetadata.copy(colourModel = colourModel)
      val metadata = ImageMetadataConverter.fromFileMetadata(fullFileMetadata, s3Source.metadata.objectMetadata.lastModified)

      val sourceAsset = Asset.fromS3Object(s3Source, sourceDimensions, sourceOrientationMetadata)
      val thumbAsset = Asset.fromS3Object(s3Thumb, thumbDimensions)

      val pngAsset = s3PngOption.map(Asset.fromS3Object(_, sourceDimensions))
      val baseImage = ImageUpload.createImage(mergedUploadRequest, sourceAsset, thumbAsset, pngAsset, fullFileMetadata, metadata)

      val processedImage = processor(baseImage)

      logger.info(logMarker, s"Ending image ops")
      // FIXME: dirty hack to sync the originalUsageRights and originalMetadata as well
      processedImage.copy(
        originalMetadata = processedImage.metadata,
        originalUsageRights = processedImage.usageRights
      )
    }
    eventualImage.onComplete{ _ =>
      tempDirForRequest.listFiles().map(f => f.delete())
      tempDirForRequest.delete()
    }
    eventualImage
  }

  private def getStorableOptimisedImage(
                                         tempDir: File,
                                         optimiseOps: OptimiseOps,
                                         browserViewableImage: BrowserViewableImage,
                                         optimisedFileMetadata: FileMetadata,
                                         tryFetchOptimisedFile: (String, File) => Future[Option[(File, MimeType)]]
  )(implicit ec: ExecutionContext, logMarker: LogMarker): Future[Option[StorableOptimisedImage]] = {
    if (optimiseOps.shouldOptimise(Some(browserViewableImage.mimeType), optimisedFileMetadata)) {
      for {
        tempFile <- createTempFile("optimisedpng-", optimisedMimeType.fileExtension, tempDir)
        maybeDownloadedOptimisedFile <- tryFetchOptimisedFile(browserViewableImage.id, tempFile)
        (optimisedFile, optimisedMimeType) <- {
          maybeDownloadedOptimisedFile match {
            case Some(optData) => Future.successful(optData)
            case None => optimiseOps.toOptimisedFile(browserViewableImage.file, browserViewableImage, tempFile)
          }
        }
      } yield Some(
        browserViewableImage.copy(
          file = optimisedFile,
          mimeType = optimisedMimeType
        ).asStorableOptimisedImage
      )
    } else if (browserViewableImage.isTransformedFromSource) {
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

    baseMeta.view.mapValues(URI.encode).toMap
  }

  private def toFileMetadata(f: File, imageId: String, mimeType: Option[MimeType])(implicit logMarker: LogMarker): Future[FileMetadata] = {
    mimeType match {
      case Some(Png | Tiff | Jpeg) => FileMetadataReader.fromIPTCHeadersWithColorInfo(f, imageId, mimeType.get)
      case _ => FileMetadataReader.fromIPTCHeaders(f, imageId)
    }
  }

  private def createThumbFuture(fileMetadata: FileMetadata,
                                colourModelFuture: Future[Option[String]],
                                browserViewableImage: BrowserViewableImage,
                                deps: ImageUploadOpsDependencies,
                                tempDir: File,
                                orientationMetadata: Option[OrientationMetadata],
  )(implicit ec: ExecutionContext, logMarker: LogMarker) = {
    import deps._

    def generateThumbnail(tempFile: File) = {
      for {
        colourModel <- colourModelFuture
        iccColourSpace = FileMetadataHelper.normalisedIccColourSpace(fileMetadata)
        thumbData <- imageOps.createThumbnail(
          browserViewableImage,
          config.thumbWidth,
          config.thumbQuality,
          tempFile,
          iccColourSpace,
          colourModel,
          orientationMetadata,
        )
      } yield thumbData
    }

    for {
      tempFile <- createTempFile(s"thumb-", thumbMimeType.fileExtension, tempDir)
      maybeThumbFile <- deps.tryFetchThumbFile(browserViewableImage.id, tempFile)
      (thumb, thumbMimeType) <- {
        maybeThumbFile match {
          case Some(thumbData) => Future.successful(thumbData)
          case None => generateThumbnail(tempFile)
        }
      }
    } yield browserViewableImage
      .copy(file = thumb, mimeType = thumbMimeType)
      .asStorableThumbImage
  }

  private def createBrowserViewableFileFuture(
    uploadRequest: UploadRequest,
    tempDir: File,
    deps: ImageUploadOpsDependencies
  )(implicit ec: ExecutionContext, logMarker: LogMarker): Future[BrowserViewableImage] = {
    import deps._
    uploadRequest.mimeType match {
      case Some(mime) if config.transcodedMimeTypes.contains(mime) =>
        for {
          (file, mimeType) <- imageOps.transformImage(uploadRequest.tempFile, uploadRequest.mimeType, tempDir)
        } yield BrowserViewableImage(
          uploadRequest.imageId,
          file = file,
          mimeType = mimeType,
          isTransformedFromSource = true
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

  def patchUploadRequestWithS3Metadata(request: UploadRequest, s3Object: S3Object): UploadRequest = {
    val metadata = S3FileExtractedMetadata(s3Object.metadata.objectMetadata.lastModified.getOrElse(new DateTime), s3Object.metadata.userMetadata)
    request.copy(
      uploadTime = metadata.uploadTime,
      uploadedBy = metadata.uploadedBy,
      uploadInfo = request.uploadInfo.copy(filename = metadata.uploadFileName),
      identifiers = metadata.identifiers
    )
  }
}

class Uploader(val store: ImageLoaderStore,
               val config: ImageLoaderConfig,
               val imageOps: ImageOperations,
               val notifications: Notifications,
               imageProcessor: ImageProcessor)
              (implicit val ec: ExecutionContext) extends MessageSubjects with ArgoHelpers {

  def fromUploadRequest(uploadRequest: UploadRequest)
                       (implicit logMarker: LogMarker): Future[ImageUpload] = {
    val sideEffectDependencies = ImageUploadOpsDependencies(toImageUploadOpsCfg(config), imageOps,
      storeSource, storeThumbnail, storeOptimisedImage)
    Stopwatch.async("finalImage") {
      val finalImage = fromUploadRequestShared(uploadRequest, sideEffectDependencies, imageProcessor)
      finalImage.map(img => ImageUpload(uploadRequest, img))
    }
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
               filename: Option[String])
              (implicit ec:ExecutionContext,
               logMarker: LogMarker): Future[UploadRequest] = Future {
    val DigestedFile(tempFile, id) = digestedFile

    // TODO: should error if the JSON parsing failed
    val identifiersMap = identifiers
      .map(Json.parse(_).as[Map[String, String]])
      .getOrElse(Map.empty)
      .view
      .mapValues(_.toLowerCase)
      .toMap

    MimeTypeDetection.guessMimeType(tempFile) match {
      case util.Left(unsupported) =>
        logger.error(logMarker, s"Unsupported mimetype", unsupported)
        throw unsupported
      case util.Right(mimeType) =>
        logger.info(logMarker, s"Detected mimetype as $mimeType")
        UploadRequest(
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
                logMarker: LogMarker): Future[UploadStatusUri] = {

    logger.info(logMarker, "Storing file")

    for {
      imageUpload <- fromUploadRequest(uploadRequest)
      updateMessage = UpdateMessage(subject = Image, image = Some(imageUpload.image))
      _ <- Future { notifications.publish(updateMessage) }
      // TODO: centralise where all these URLs are constructed
    } yield UploadStatusUri(s"${config.rootUri}/uploadStatus/${uploadRequest.imageId}")

  }

  def restoreFile(uploadRequest: UploadRequest,
                  gridClient: GridClient,
                  onBehalfOfFn: WSRequest => WSRequest)
                 (implicit ec: ExecutionContext,
                  logMarker: LogMarker): Future[Unit] = for {
    imageUpload <- fromUploadRequest(uploadRequest)
    imageWithoutUserEdits = imageUpload.image
    imageWithUserEditsApplied <- ImageDataMerger.aggregate(imageWithoutUserEdits, gridClient, onBehalfOfFn)
    _ <- Future {
      notifications.publish(
        UpdateMessage(subject = Image, image = Some(imageWithUserEditsApplied))
      )
    }
  } yield ()

}

