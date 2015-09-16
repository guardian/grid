package lib.imaging

import java.io._

import com.gu.mediaservice.lib.Files

import scala.concurrent.Future

import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.model.{Dimensions, ImageMetadata, Asset, Bounds}
import com.gu.mediaservice.lib.imaging.im4jwrapper.{ImageMagick, ExifTool}

import lib.Config
import Files._


case class ExportResult(id: String, masterCrop: Asset, othersizings: List[Asset])

object ExportOperations {
  import ImageMagick._
  import ExifTool._

  lazy val imageProfileLocation = s"${play.api.Play.current.path}/srgb.icc"

  def tagFilter(metadata: ImageMetadata) = {
    Map[String, Option[String]](
      "Copyright" -> metadata.copyright,
      "CopyrightNotice" -> metadata.copyrightNotice,
      "Credit" -> metadata.credit,
      "OriginalTransmissionReference" -> metadata.suppliersReference
    ).collect { case (key, Some(value)) => (key, value) }
  }

  def cropImage(sourceFile: File, bounds: Bounds, qual: Double = 100d): Future[File] = {
    for {
      outputFile <- createTempFile(s"crop-", ".jpg", Config.tempDir)
      cropSource  = addImage(sourceFile)
      qualified   = quality(cropSource)(qual)
      converted   = profile(qualified)(imageProfileLocation)
      stripped    = stripMeta(converted)
      profiled    = profile(stripped)(imageProfileLocation)
      cropped     = crop(profiled)(bounds)
      addOutput   = addDestImage(cropped)(outputFile)
      _          <- runConvertCmd(addOutput)
    }
    yield outputFile
  }

  // Updates metadata on existing file
  def appendMetadata(sourceFile: File, metadata: ImageMetadata): Future[File] = {
    runExiftoolCmd(
      setTags(tagSource(sourceFile))(tagFilter(metadata))
      ).map(_ => sourceFile)
  }

  def resizeImage(sourceFile: File, dimensions: Dimensions, qual: Double = 100d): Future[File] = {
    for {
      outputFile  <- createTempFile(s"resize-", ".jpg", Config.tempDir)
      resizeSource = addImage(sourceFile)
      qualified    = quality(resizeSource)(qual)
      resized      = scale(qualified)(dimensions)
      addOutput    = addDestImage(resized)(outputFile)
      _           <- runConvertCmd(addOutput)
    }
    yield outputFile
  }
}
