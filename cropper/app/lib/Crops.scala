package lib

import java.io.File

import com.gu.mediaservice.lib.metadata.FileMetadataHelper

import scala.concurrent.Future
import com.gu.mediaservice.model._
import com.gu.mediaservice.lib.Files
import com.gu.mediaservice.lib.imaging.{ExportResult, ImageOperations}
import com.gu.mediaservice.lib.imaging.ImageOperations.MimeType

import scala.sys.process._

case object InvalidImage extends Exception("Invalid image cannot be cropped")
case object MissingMimeType extends Exception("Missing mimeType from source API")
case object MissingSecureSourceUrl extends Exception("Missing secureUrl from source API")
case object InvalidCropRequest extends Exception("Crop request invalid for image dimensions")

case class MasterCrop(sizing: Future[Asset], file: File, dimensions: Dimensions, aspectRatio: Float)

class Crops(config: CropperConfig, store: CropStore, imageOperations: ImageOperations) {
  import scala.concurrent.ExecutionContext.Implicits.global
  import Files._

  private val cropQuality = 75d
  private val masterCropQuality = 95d

  def outputFilename(source: SourceImage, bounds: Bounds, outputWidth: Int, fileType: String, isMaster: Boolean = false): String = {
    s"${source.id}/${Crop.getCropId(bounds)}/${if(isMaster) "master/" else ""}$outputWidth.$fileType"
  }

  def createMasterCrop(apiImage: SourceImage, sourceFile: File, crop: Crop, mediaType: MimeType, colourModel: Option[String],
                      colourType: String): Future[MasterCrop] = {

    val source   = crop.specification
    val metadata = apiImage.metadata
    val iccColourSpace = FileMetadataHelper.normalisedIccColourSpace(apiImage.fileMetadata)

    for {
      strip <- imageOperations.cropImage(sourceFile, source.bounds, masterCropQuality, config.tempDir, iccColourSpace, colourModel, mediaType.extension)
      file: File <- imageOperations.appendMetadata(strip, metadata)


      //Before apps and frontend can handle PNG24s we need to pngquant PNG24 master crops
      optimisedFile =  if (colourType == "True Color with Alpha") {

        val fileName = file.getAbsolutePath()


        val optimisedImageName: String = fileName.split('.')(0) + "optimised.png"
        Seq("pngquant", "--quality", "1-85", fileName, "--output", optimisedImageName).!
        new File(optimisedImageName)
      } else file

      dimensions  = Dimensions(source.bounds.width, source.bounds.height)
      filename    = outputFilename(apiImage, source.bounds, dimensions.width, mediaType.extension, true)
      sizing      = store.storeCropSizing(file, filename, mediaType.name, crop, dimensions)
      dirtyAspect = source.bounds.width.toFloat / source.bounds.height
      aspect      = crop.specification.aspectRatio.flatMap(AspectRatio.clean).getOrElse(dirtyAspect)

    }
    yield MasterCrop(sizing, optimisedFile, dimensions, aspect)
  }

  def createCrops(sourceFile: File, dimensionList: List[Dimensions], apiImage: SourceImage, crop: Crop,
                  mediaType: MimeType): Future[List[Asset]] = {

    Future.sequence[Asset, List](dimensionList.map { dimensions =>
      for {
        file          <- imageOperations.resizeImage(sourceFile, dimensions, cropQuality, config.tempDir, mediaType.extension)
        optimisedFile = imageOperations.optimiseImage(file, mediaType)
        filename      = outputFilename(apiImage, crop.specification.bounds, dimensions.width, mediaType.extension)
        sizing        <- store.storeCropSizing(optimisedFile, filename, mediaType.extension, crop, dimensions)
        _             <- delete(file)
        _             <- delete(optimisedFile)
      }
      yield sizing
    })
  }

  def deleteCrops(id: String) = store.deleteCrops(id)

  def dimensionsFromConfig(bounds: Bounds, aspectRatio: Float): List[Dimensions] = if (bounds.isPortrait)
      config.portraitCropSizingHeights.filter(_ <= bounds.height).map(h => Dimensions(math.round(h * aspectRatio), h))
    else
    config.landscapeCropSizingWidths.filter(_ <= bounds.width).map(w => Dimensions(w, math.round(w / aspectRatio)))

  def isWithinImage(bounds: Bounds, dimensions: Dimensions): Boolean = {
    val positiveCoords       = List(bounds.x,     bounds.y     ).forall(_ >= 0)
    val strictlyPositiveSize = List(bounds.width, bounds.height).forall(_  > 0)
    val withinBounds = (bounds.x + bounds.width  <= dimensions.width ) &&
                       (bounds.y + bounds.height <= dimensions.height)

    positiveCoords && strictlyPositiveSize && withinBounds
  }

  def export(apiImage: SourceImage, crop: Crop): Future[ExportResult] = {
    val source    = crop.specification
    val mediaType = apiImage.source.mimeType.getOrElse(throw MissingMimeType)
    val secureUrl = apiImage.source.secureUrl.getOrElse(throw MissingSecureSourceUrl)
    val colourType = apiImage.fileMetadata.colourModelInformation.getOrElse("colorType", "")

    val cropType = if (mediaType == "image/png" && colourType != "True Color")
      ImageOperations.Png
    else
      ImageOperations.Jpeg

    for {
      sourceFile  <- tempFileFromURL(secureUrl, "cropSource", "", config.tempDir)
      colourModel <- ImageOperations.identifyColourModel(sourceFile, mediaType)
      masterCrop  <- createMasterCrop(apiImage, sourceFile, crop, cropType, colourModel, colourType)

      outputDims = dimensionsFromConfig(source.bounds, masterCrop.aspectRatio) :+ masterCrop.dimensions

      sizes      <- createCrops(masterCrop.file, outputDims, apiImage, crop, cropType)
      masterSize <- masterCrop.sizing

      _ <- Future.sequence(List(masterCrop.file,sourceFile).map(delete))
    }
    yield ExportResult(apiImage.id, masterSize, sizes)
  }
}
