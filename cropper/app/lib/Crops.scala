package lib

import java.io.File
import com.gu.mediaservice.lib.metadata.FileMetadataHelper
import com.gu.mediaservice.lib.Files
import com.gu.mediaservice.lib.imaging.vips.VipsImage
import com.gu.mediaservice.lib.imaging.{ExportResult, MagickImageOperations, VipsImageOperations}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, Stopwatch}
import com.gu.mediaservice.model._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

case object InvalidImage extends Exception("Invalid image cannot be cropped")

case object MissingMimeType extends Exception("Missing mimeType from source API")

case object MissingSecureSourceUrl extends Exception("Missing secureUrl from source API")

case object InvalidCropRequest extends Exception("Crop request invalid for image dimensions")

case class MasterCrop(sizing: Future[Asset], file: File, dimensions: Dimensions, aspectRatio: Float)

class Crops(config: CropperConfig, store: CropStore, magickImageOperations: MagickImageOperations, vipsImageOperations: VipsImageOperations)(implicit ec: ExecutionContext) extends GridLogging {

  import Files._

  private val cropQuality = 75d
  private val masterCropQuality = 95d

  def outputFilename(source: SourceImage, bounds: Bounds, outputWidth: Int, fileType: MimeType, isMaster: Boolean = false): String = {
    val masterString: String = if (isMaster) "master/" else ""
    s"${source.id}/${Crop.getCropId(bounds)}/${masterString}$outputWidth${fileType.fileExtension}"
  }

  def createMasterCropWithVips(
    apiImage: SourceImage,
    sourceImage: VipsImage,
    crop: Crop,
    mediaType: MimeType,
    colourModel: Option[String]
  )(implicit logMarker: LogMarker): Future[(MasterCrop, VipsImage)] = {

    logger.info(logMarker, s"Making master crop for ${apiImage.id} with VIPS")
    val source = crop.specification
    val metadata = apiImage.metadata
    val iccColourSpace = FileMetadataHelper.normalisedIccColourSpace(apiImage.fileMetadata)

    for {
      img <- vipsImageOperations.cropImage(sourceImage, source.bounds)
      imageFile <- vipsImageOperations.saveImage(img, config.tempDir, masterCropQuality.toInt, mediaType, colourModel)
      addedMetadata <- magickImageOperations.appendMetadata(imageFile, metadata)
      dimensions = Dimensions(source.bounds.width, source.bounds.height)
      filename = outputFilename(apiImage, source.bounds, dimensions.width, mediaType, isMaster = true)
      sizing = store.storeCropSizing(addedMetadata, filename, mediaType, crop, dimensions)
      dirtyAspect = source.bounds.width.toFloat / source.bounds.height
      aspect = crop.specification.aspectRatio.flatMap(AspectRatio.clean).getOrElse(dirtyAspect)
    }
    yield (MasterCrop(sizing, imageFile, dimensions, aspect), img)
  }

  def createMasterCropWithImageMagick(
    apiImage: SourceImage,
    sourceFile: File,
    crop: Crop,
    mediaType: MimeType,
    colourModel: Option[String],
  )(implicit logMarker: LogMarker): Future[MasterCrop] = {

    val source = crop.specification
    val metadata = apiImage.metadata
    val iccColourSpace = FileMetadataHelper.normalisedIccColourSpace(apiImage.fileMetadata)

    logger.info(logMarker, s"creating master crop for ${apiImage.id}")

    for {
      strip <- magickImageOperations.cropImage(
        sourceFile, apiImage.source.mimeType, source.bounds, masterCropQuality, config.tempDir,
        iccColourSpace, colourModel, mediaType, isTransformedFromSource = false
      )
      file: File <- magickImageOperations.appendMetadata(strip, metadata)
      dimensions = Dimensions(source.bounds.width, source.bounds.height)
      filename = outputFilename(apiImage, source.bounds, dimensions.width, mediaType, isMaster = true)
      sizing = store.storeCropSizing(file, filename, mediaType, crop, dimensions)
      dirtyAspect = source.bounds.width.toFloat / source.bounds.height
      aspect = crop.specification.aspectRatio.flatMap(AspectRatio.clean).getOrElse(dirtyAspect)
    }
    yield MasterCrop(sizing, file, dimensions, aspect)
  }

  def createCropsWithVips(
    sourceImage: VipsImage,
    dimensionList: List[Dimensions],
    apiImage: SourceImage,
    crop: Crop,
    cropType: MimeType,
  )(implicit logMarker: LogMarker): Future[List[Asset]] = {
    logger.info(logMarker, s"creating crops for ${apiImage.id} with VIPS")

    Future.sequence[Asset, List](dimensionList.map { dimensions =>
      val scale = dimensions.width.toDouble / apiImage.source.dimensions.get.width.toDouble
      for {
        resizedImage <- vipsImageOperations.resizeImage(sourceImage, scale) //apiImage.source.mimeType, dimensions, scale, cropQuality, config.tempDir, cropType)
        file <- vipsImageOperations.saveImage(resizedImage, config.tempDir, cropQuality.toInt, cropType, None)
        optimisedFile = magickImageOperations.optimiseImage(file, cropType)
        filename = outputFilename(apiImage, crop.specification.bounds, dimensions.width, cropType)
        sizing <- store.storeCropSizing(optimisedFile, filename, cropType, crop, dimensions)
        _ <- delete(file)
        _ <- delete(optimisedFile)
      }
      yield sizing
    })
  }
  def createCropsWithImageMagick(
    sourceFile: File,
    dimensionList: List[Dimensions],
    apiImage: SourceImage,
    crop: Crop,
    cropType: MimeType,
  )(implicit logMarker: LogMarker): Future[List[Asset]] = {
    logger.info(logMarker, s"creating crops for ${apiImage.id}")

    Future.sequence[Asset, List](dimensionList.map { dimensions =>
      val scale = dimensions.width.toDouble / apiImage.source.dimensions.get.width.toDouble
      for {
        file <- magickImageOperations.resizeImage(sourceFile, apiImage.source.mimeType, dimensions, scale, cropQuality, config.tempDir, cropType)
        optimisedFile = magickImageOperations.optimiseImage(file, cropType)
        filename = outputFilename(apiImage, crop.specification.bounds, dimensions.width, cropType)
        sizing <- store.storeCropSizing(optimisedFile, filename, cropType, crop, dimensions)
        _ <- delete(file)
        _ <- delete(optimisedFile)
      }
      yield sizing
    })
  }

  def deleteCrops(id: String)(implicit logMarker: LogMarker): Future[Unit] = store.deleteCrops(id)

  def dimensionsFromConfig(bounds: Bounds, aspectRatio: Float): List[Dimensions] = {
    if (bounds.isPortrait)
      config.portraitCropSizingHeights.filter(_ <= bounds.height).map(h => Dimensions(math.round(h * aspectRatio), h))
    else
      config.landscapeCropSizingWidths.filter(_ <= bounds.width).map(w => Dimensions(w, math.round(w / aspectRatio)))
  }

  def isWithinImage(bounds: Bounds, dimensions: Dimensions): Boolean = {
    val positiveCoords = List(bounds.x, bounds.y).forall(_ >= 0)
    val strictlyPositiveSize = List(bounds.width, bounds.height).forall(_ > 0)
    val withinBounds = (bounds.x + bounds.width <= dimensions.width) &&
      (bounds.y + bounds.height <= dimensions.height)

    positiveCoords && strictlyPositiveSize && withinBounds
  }

  def exportWithVips(apiImage: SourceImage, crop: Crop)(implicit logMarker: LogMarker): Future[ExportResult] = {
    val source = crop.specification
    val mimeType = apiImage.source.mimeType.getOrElse(throw MissingMimeType)
    val secureUrl = apiImage.source.secureUrl.getOrElse(throw MissingSecureSourceUrl)
    val colourType = apiImage.fileMetadata.colourModelInformation.getOrElse("colorType", "")
    val hasAlpha = apiImage.fileMetadata.colourModelInformation.get("hasAlpha").flatMap(a => Try(a.toBoolean).toOption).getOrElse(true)
    val cropType = Crops.cropType(mimeType, colourType, hasAlpha)

    Stopwatch(s"making crop assets for ${apiImage.id} ${Crop.getCropId(source.bounds)} using VIPS!!!!") {
      for {
        sourceFile <- tempFileFromURL(secureUrl, "cropSource", "", config.tempDir)
        sourceImage <- vipsImageOperations.loadImage(sourceFile)

        // TODO colourModel
        (masterCrop, masterCropImage) <- createMasterCropWithVips(apiImage, sourceImage, crop, cropType, colourModel = None)

        outputDims = dimensionsFromConfig(source.bounds, masterCrop.aspectRatio) :+ masterCrop.dimensions

        resizes <- createCropsWithVips(masterCropImage, outputDims, apiImage, crop, cropType)

        masterSize <- masterCrop.sizing

        _ <- Future.sequence(List(masterCrop.file, sourceFile).map(delete))
      }
      yield ExportResult(apiImage.id, masterSize, resizes)
    }

  }

  def exportWithImageMagick(apiImage: SourceImage, crop: Crop)(implicit logMarker: LogMarker): Future[ExportResult] = {
    val source = crop.specification
    val mimeType = apiImage.source.mimeType.getOrElse(throw MissingMimeType)
    val secureUrl = apiImage.source.secureUrl.getOrElse(throw MissingSecureSourceUrl)
    val colourType = apiImage.fileMetadata.colourModelInformation.getOrElse("colorType", "")
    val hasAlpha = apiImage.fileMetadata.colourModelInformation.get("hasAlpha").flatMap(a => Try(a.toBoolean).toOption).getOrElse(true)
    val cropType = Crops.cropType(mimeType, colourType, hasAlpha)

    Stopwatch(s"making crop assets for ${apiImage.id} ${Crop.getCropId(source.bounds)} using magick") {
      for {
        sourceFile <- tempFileFromURL(secureUrl, "cropSource", "", config.tempDir)
        colourModel <- MagickImageOperations.identifyColourModel(sourceFile, mimeType)
        masterCrop <- createMasterCropWithImageMagick(apiImage, sourceFile, crop, cropType, colourModel)

        outputDims = dimensionsFromConfig(source.bounds, masterCrop.aspectRatio) :+ masterCrop.dimensions

        sizes <- createCropsWithImageMagick(masterCrop.file, outputDims, apiImage, crop, cropType)
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
      case Png if outputAsPng => Png
      case Tiff if outputAsPng => Png
      case _ => Jpeg
    }
  }
}
