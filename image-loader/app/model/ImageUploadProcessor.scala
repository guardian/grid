package model

import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.UUID

import com.gu.mediaservice.lib.aws.S3Object
import com.gu.mediaservice.lib.cleanup.ImageProcessor
import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.lib.{BrowserViewableImage, StorableOptimisedImage, StorableOriginalImage, StorableThumbImage}
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, addLogMarkers}
import com.gu.mediaservice.lib.metadata.{FileMetadataHelper, ImageMetadataConverter}
import com.gu.mediaservice.model.leases.LeasesByMedia
import com.gu.mediaservice.model.usage.Usage
import com.gu.mediaservice.model.{Asset, Collection, Crop, FileMetadata, Image, Jpeg, MimeType, Png, Tiff, UploadInfo}
import lib.{DigestedFile, ImageLoaderConfig}
import lib.imaging.{FileMetadataReader, MimeTypeDetection}
import model.upload.{OptimiseOps, OptimiseWithPngQuant, UploadRequest}
import org.joda.time.DateTime
import play.api.libs.json.JsObject

import scala.concurrent.{ExecutionContext, Future}

case class ImageUploadOpsDependencies(
                                       config: ImageUploadOpsCfg,
                                       imageOps: ImageOperations,
                                       putOriginalFile: StorableOriginalImage => Future[S3Object],
                                       putThumbFile: StorableThumbImage => Future[S3Object],
                                       putOptimisedImage: StorableOptimisedImage => Future[S3Object],
                                       getUsages: String => Future[List[Usage]],
                                       getCollections: String => Future[List[Collection]],
                                       getLeases: String => Future[LeasesByMedia],
                                       getExports: String => Future[List[Crop]]
                                     )

// This trait represents one of the following:
// - an attempt to upload a new image
// - an attempt to show what data would _now_ be created for an existing image, using current SupplierProcessor
// - an attempt to re-ingest the data for an existing image, eg to clean metadata using current SupplierProcessor
object ImageUploadProcessor extends GridLogging {
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

}
trait ImageUploadProcessor extends GridLogging {

  def name: String

  def storeFile(uploadRequest: UploadRequest)
               (implicit ec:ExecutionContext, logMarker: LogMarker): Future[JsObject]


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
        putOriginalFile,
        putThumbFile,
        putOptimisedImage,
        getUsages,
//        getCollections,
        getLeases,
        getExports,
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
                                         getUsages: String => Future[List[Usage]],
//                                         getCollections: String => Future[List[Collection]],
                                         getLeases: String => Future[LeasesByMedia],
                                         getExports: String => Future[List[Crop]],
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
      ImageUploadProcessor.toMetaMap(uploadRequest)
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
        case Some(storableOptimisedImage) => storeOrProjectOptimisedFile(storableOptimisedImage).map(a => Some(a))
        case None => Future.successful(None)
      }
      sourceDimensions <- sourceDimensionsFuture
      thumbDimensions <- FileMetadataReader.dimensions(thumbViewableImage.file, Some(Jpeg))
      colourModel <- colourModelFuture
      usages <- getUsages(uploadRequest.imageId)
//      collections <- getCollections(uploadRequest.imageId)
      leases <- getLeases(uploadRequest.imageId)
      exports <- getExports(uploadRequest.imageId)
    } yield {
      val fullFileMetadata = fileMetadata.copy(colourModel = colourModel)
      val metadata = ImageMetadataConverter.fromFileMetadata(fullFileMetadata, s3Source.metadata.objectMetadata.lastModified)

      val sourceAsset = Asset.fromS3Object(s3Source, sourceDimensions)
      val thumbAsset = Asset.fromS3Object(s3Thumb, thumbDimensions)

      val pngAsset = s3PngOption.map(Asset.fromS3Object(_, sourceDimensions))
      val baseImage = ImageUpload.createImage(uploadRequest, sourceAsset, thumbAsset, pngAsset, fullFileMetadata, metadata)

      val processedImage = processor(baseImage)

      logger.info("Ending image ops")
      processedImage.copy(
        // FIXME: dirty hack to sync the originalUsageRights and originalMetadata as well
        originalMetadata = processedImage.metadata,
        originalUsageRights = processedImage.usageRights
      ).copy(
        // Get the various values from dynamo stores (or elsewhere, it's a provided function) and add them in
        leases = leases,
//        collections = collections,
        exports = exports,
        usages = usages
      )
    }
    eventualImage.onComplete { _ =>
      makeNewDirInTempDirHere.listFiles().map(f => f.delete())
      makeNewDirInTempDirHere.delete()
    }
    eventualImage
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

  def loadFile(digestedFile: DigestedFile,
               uploadedBy: String,
               identifiersMap: Map[String, String],
               uploadTime: DateTime,
               filename: Option[String],
               requestId: UUID)
              (implicit ec: ExecutionContext,
               logMarker: LogMarker): Future[UploadRequest] = Future {
    val DigestedFile(tempFile, id) = digestedFile

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

}
