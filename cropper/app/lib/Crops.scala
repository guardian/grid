package lib

import java.io.File
import com.gu.mediaservice.lib.metadata.FileMetadataHelper
import com.gu.mediaservice.lib.Files
import com.gu.mediaservice.lib.aws.{S3, S3Bucket}
import com.gu.mediaservice.lib.imaging.{ExportResult, ImageOperations}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, Stopwatch}
import com.gu.mediaservice.model._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

case object InvalidImage extends Exception("Invalid image cannot be cropped")
case object MissingMimeType extends Exception("Missing mimeType from source API")
case object InvalidCropRequest extends Exception("Crop request invalid for image dimensions")

case class MasterCrop(sizing: Future[Asset], file: File, dimensions: Dimensions, aspectRatio: Float)

class Crops(config: CropperConfig, store: CropStore, imageOperations: ImageOperations, imageBucket: S3Bucket, s3: S3)(implicit ec: ExecutionContext) extends GridLogging {
  import Files._

  private val cropQuality = 75d
  private val masterCropQuality = 95d
  // For PNGs, Magick considers "quality" parameter as effort spent on compression - 1 meaning none, 100 meaning max.
  // We don't overly care about output crop file sizes here, but prefer a fast output, so turn it right down.
  private val pngCropQuality = 1d

  def outputFilename(source: SourceImage, bounds: Bounds, outputWidth: Int, fileType: MimeType, isMaster: Boolean = false, instance: Instance): String = {
    val masterString: String = if (isMaster) "master/" else ""
    instance.id + "/" + s"${source.id}/${Crop.getCropId(bounds)}/$masterString$outputWidth${fileType.fileExtension}"
  }

  def createMasterCrop(
    apiImage: SourceImage,
    sourceFile: File,
    crop: Crop,
    mediaType: MimeType,
    colourModel: Option[String],
    instance: Instance,
    orientationMetadata: Option[OrientationMetadata],
  )(implicit logMarker: LogMarker): Future[MasterCrop] = {

    Stopwatch.async(s"creating master crop for ${apiImage.id}") {
      val source = crop.specification
      val metadata = apiImage.metadata
      val iccColourSpace = FileMetadataHelper.normalisedIccColourSpace(apiImage.fileMetadata)
      // pngs are always lossless, so quality only means effort spent compressing them. We don't
      // care too much about filesize of master crops, so skip expensive compression to get faster cropping
      val quality = if (mediaType == Png) pngCropQuality else masterCropQuality

      for {
        strip <- imageOperations.cropImage(
          sourceFile, apiImage.source.mimeType, source.bounds, quality, config.tempDir,
          iccColourSpace, colourModel, mediaType, isTransformedFromSource = false,
          orientationMetadata = orientationMetadata
        )
        file: File <- imageOperations.appendMetadata(strip, metadata)
        dimensions = Dimensions(source.bounds.width, source.bounds.height)
        filename = outputFilename(apiImage, source.bounds, dimensions.width, mediaType, isMaster = true, instance = instance)
        sizing = store.storeCropSizing(file, filename, mediaType, crop, dimensions)
        dirtyAspect = source.bounds.width.toFloat / source.bounds.height
        aspect = crop.specification.aspectRatio.flatMap(AspectRatio.clean).getOrElse(dirtyAspect)
      }
      yield MasterCrop(sizing, file, dimensions, aspect)
    }
  }

  def createCrops(sourceFile: File, dimensionList: List[Dimensions], apiImage: SourceImage, crop: Crop, cropType: MimeType, instance: Instance)(implicit logMarker: LogMarker): Future[List[Asset]] = {
    val quality = if (cropType == Png) pngCropQuality else cropQuality

    Stopwatch.async(s"creating crops for ${apiImage.id}") {
      Future.sequence(dimensionList.map { dimensions =>
        val cropLogMarker = logMarker ++ Map("crop-dimensions" -> s"${dimensions.width}x${dimensions.height}")
        for {
          file <- imageOperations.resizeImage(sourceFile,
            apiImage.source.mimeType,
            dimensions,
            quality,
            config.tempDir,
            cropType)(cropLogMarker)
          optimisedFile = imageOperations.optimiseImage(file, cropType)(cropLogMarker)
          filename = outputFilename(apiImage, crop.specification.bounds, dimensions.width, cropType, instance = instance)
          sizing <- store.storeCropSizing(optimisedFile, filename, cropType, crop, dimensions)(cropLogMarker)
          _ <- delete(file)
          _ <- delete(optimisedFile)
        }
        yield sizing
      })
    }
  }

  def deleteCrops(id: String)(implicit logMarker: LogMarker, instance: Instance): Future[Unit] = store.deleteCrops(id)

  private def dimensionsFromConfig(bounds: Bounds, aspectRatio: Float): List[Dimensions] = if (bounds.isPortrait)
      config.portraitCropSizingHeights.filter(_ <= bounds.height).map(h => Dimensions(math.round(h * aspectRatio), h))
    else
    config.landscapeCropSizingWidths.filter(_ <= bounds.width).map(w => Dimensions(w, math.round(w / aspectRatio)))

  def isWithinImage(bounds: Bounds, dimensions: Dimensions): Boolean = {
    logger.info(s"Validating crop bounds ($bounds) against dimensions: $dimensions")
    val positiveCoords       = List(bounds.x,     bounds.y     ).forall(_ >= 0)
    val strictlyPositiveSize = List(bounds.width, bounds.height).forall(_  > 0)
    val withinBounds = (bounds.x + bounds.width  <= dimensions.width ) &&
                       (bounds.y + bounds.height <= dimensions.height)

    positiveCoords && strictlyPositiveSize && withinBounds
  }

  def makeExport(apiImage: SourceImage, crop: Crop, instance: Instance)(implicit logMarker: LogMarker): Future[ExportResult] = {
    val source    = crop.specification
    val mimeType = apiImage.source.mimeType.getOrElse(throw MissingMimeType)
    val secureFile = apiImage.source.file
    val colourType = apiImage.fileMetadata.colourModelInformation.getOrElse("colorType", "")
    val hasAlpha = apiImage.fileMetadata.colourModelInformation.get("hasAlpha").flatMap(a => Try(a.toBoolean).toOption).getOrElse(true)
    val cropType = Crops.cropType(mimeType, colourType, hasAlpha)

    val key = imageBucket.keyFromS3URL(secureFile)
    val secureUrl = s3.signUrlTony(imageBucket, key)

    Stopwatch.async(s"making crop assets for ${apiImage.id} ${Crop.getCropId(source.bounds)}") {
      for {
        sourceFile <- tempFileFromURL(secureUrl, "cropSource", "", config.tempDir)
        colourModelAndInformation <- ImageOperations.getColourModelAndInformation(sourceFile)
        colourModel = colourModelAndInformation._1
        masterCrop <- createMasterCrop(apiImage, sourceFile, crop, cropType, colourModel, instance, apiImage.source.orientationMetadata)

        outputDims = dimensionsFromConfig(source.bounds, masterCrop.aspectRatio) :+ masterCrop.dimensions

        sizes <- createCrops(masterCrop.file, outputDims, apiImage, crop, cropType, instance)
        masterSize <- masterCrop.sizing

        _ <- Future.sequence(List(masterCrop.file, sourceFile).map(delete))
      }
      yield ExportResult(apiImage.id, masterSize, sizes)
    }
  }
}

object Crops {
  /**
    * The aim here is to decide whether the crops should be JPEG or PNGs depending on a predicted quality/size trade-off.
    *  - If the image has transparency then it should always be a PNG as the transparency is not available in JPEG
    *  - If the image is not true colour then we assume it is a graphic that should be retained as a PNG
    */
  def cropType(mediaType: MimeType, colourType: String, hasAlpha: Boolean): MimeType = {
    val isGraphic = !colourType.matches("True[ ]?Color.*")
    val outputAsPng = hasAlpha || isGraphic

    mediaType match {
      case Png | Tiff if outputAsPng => Png
      case _ => Jpeg
    }
  }
}
