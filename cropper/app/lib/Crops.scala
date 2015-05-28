package lib

import scala.concurrent.Future
import lib.imaging.{ExportOperations, ExportResult}
import com.gu.mediaservice.model.{Asset, Dimensions, SourceImage, Crop, Bounds}
import java.net.{URI, URL}
import java.io.File

case object InvalidImage extends Exception("Invalid image cannot be cropped")
case object MissingSecureSourceUrl extends Exception("Missing secureUrl from source API")

case class MasterCrop(sizing: Future[Asset], file: File, dimensions: Dimensions, aspectRatio: Float)

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
      sizing     = CropStore.storeCropSizing(file, filename, mediaType, crop, dimensions)
      aspect     = source.bounds.width.toFloat / source.bounds.height
    }
    yield MasterCrop(sizing, file, dimensions, aspect)
  }

  def createCrops(sourceFile: File, dimensionList: List[Dimensions], apiImage: SourceImage, crop: Crop, mediaType: String): Future[List[Asset]] = {
    Future.sequence[Asset, List](dimensionList.map { dimensions =>
      val filename = outputFilename(apiImage, crop.specification.bounds, dimensions.width)
      for {
        file    <- ExportOperations.resizeImage(sourceFile, dimensions, 75d)
        sizing  <- CropStore.storeCropSizing(file, filename, mediaType, crop, dimensions)
        _       <- delete(file)
      }
      yield sizing
    })
  }

  def dimensionsFromConfig(bounds: Bounds, aspectRatio: Float): List[Dimensions] = if (bounds.isPortrait)
      Config.portraitCropSizingHeights.filter(_ <= bounds.height).map(h => Dimensions(math.round(h * aspectRatio), h))
    else
      Config.landscapeCropSizingWidths.filter(_ <= bounds.width).map(w => Dimensions(w, math.round(w / aspectRatio)))

  def export(apiImage: SourceImage, crop: Crop): Future[ExportResult] = {
    val source    = crop.specification
    val mediaType = "image/jpeg"
    val secureUrl = apiImage.source.secureUrl.getOrElse(throw MissingSecureSourceUrl)

    for {
      sourceFile <- tempFileFromURL(secureUrl, "cropSource", "")
      masterCrop <- createMasterCrop(apiImage, sourceFile, crop, mediaType)

      outputDims = dimensionsFromConfig(source.bounds, masterCrop.aspectRatio) :+ masterCrop.dimensions

      sizes      <- createCrops(masterCrop.file, outputDims, apiImage, crop, mediaType)
      masterSize <- masterCrop.sizing

      _ <- Future.sequence(List(masterCrop.file,sourceFile).map(delete(_)))
    }
    yield ExportResult(apiImage.id, masterSize, sizes)
  }

}
