package lib

import scala.concurrent.Future
import lib.imaging.{ExportOperations, ExportResult}
import model.{Crop, SourceImage, Bounds, Dimensions, CropSizing}
import java.net.{URI, URL}
import java.io.File

case object InvalidImage extends Exception("Invalid image cannot be cropped")
case class MasterCrop(sizing: Future[CropSizing], file: File, dimensions: Dimensions, aspectRatio: Float)

object Crops {
  import scala.concurrent.ExecutionContext.Implicits.global
  import Files._

  def outputFilename(source: SourceImage, bounds: Bounds, outputWidth: Int, isMaster: Boolean = false): String = {
    s"${source.id}/${Crop.getCropId(bounds)}/${if(isMaster) "master/" else ""}$outputWidth.jpg"
  }

  def createMasterCrop(apiImage: SourceImage, sourceFile: File, crop: Crop, mediaType: String): Future[MasterCrop] = {
    val source   = crop.specification
    val metadata = apiImage.metadata

    for {
      strip <- ExportOperations.cropImage(sourceFile, source.bounds, 100d)
      file  <- ExportOperations.appendMetadata(strip, metadata)

      dimensions = Dimensions(source.bounds.width, source.bounds.height)
      filename   = outputFilename(apiImage, source.bounds, dimensions.width, true)
      sizing     = CropStorage.storeCropSizing(file, filename, mediaType, crop, dimensions)
      aspect     = source.bounds.width.toFloat / source.bounds.height
    }
    yield MasterCrop(sizing, file, dimensions, aspect)
  }

  def createCrops(sourceFile: File, dimensionList: List[Dimensions], apiImage: SourceImage, crop: Crop, mediaType: String): Future[List[CropSizing]] = {
    Future.sequence[CropSizing, List](dimensionList.map { dimensions =>
      val filename = outputFilename(apiImage, crop.specification.bounds, dimensions.width)
      for {
        file    <- ExportOperations.resizeImage(sourceFile, dimensions, 75d)
        sizing  <- CropStorage.storeCropSizing(file, filename, mediaType, crop, dimensions)
        _       <- delete(file)
      }
      yield sizing
    })
  }

  def dimesionsFromConfig(bounds: Bounds, aspectRatio: Float): List[Dimensions] = if (bounds.isPortrait)
      Config.portraitCropSizingHeights.filter(_ <= bounds.height).map(h => Dimensions(math.round(h * aspectRatio), h))
    else
      Config.landscapeCropSizingWidths.filter(_ <= bounds.width).map(w => Dimensions(w, math.round(w / aspectRatio)))

  def createSizings(sourceImageFuture: Future[SourceImage], crop: Crop): Future[ExportResult] = {
    val source    = crop.specification
    val mediaType = "image/jpeg"

    for {
      apiImage   <- sourceImageFuture
      _          <- if (apiImage.valid) Future.successful(()) else Future.failed(InvalidImage)
      sourceFile <- tempFileFromURL(new URL(apiImage.source.secureUrl), "cropSource", "")
      masterCrop <- createMasterCrop(apiImage,sourceFile, crop, mediaType)

      outputDims = dimesionsFromConfig(source.bounds, masterCrop.aspectRatio) :+ masterCrop.dimensions

      sizes      <- createCrops(masterCrop.file, outputDims, apiImage, crop, mediaType)
      masterSize <- masterCrop.sizing

      _ <- Future.sequence(List(masterCrop.file,sourceFile).map(delete(_)))
    }
    yield ExportResult(apiImage.id, masterSize, sizes)
  }

}
