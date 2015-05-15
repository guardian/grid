package lib.imaging

import java.io._

import scala.concurrent.Future

import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.model.{Dimensions, ImageMetadata, Asset}

import lib.Files._
import model.{Bounds, CropSource}


case class ExportResult(id: String, masterCrop: Asset, othersizings: List[Asset])

object ExportOperations {
  import lib.imaging.im4jwrapper.Convert._
  import lib.imaging.im4jwrapper.ExifTool._

  lazy val imageProfileLocation = s"${play.api.Play.current.path}/app/assets/srgb.icc"

  def tagFilter(metadata: ImageMetadata) = {
    Map[String, Option[String]](
      "Copyright" -> metadata.copyright,
      "CopyrightNotice" -> metadata.copyrightNotice,
      "Credit" -> metadata.credit,
      "OriginalTransmissionReference" -> metadata.suppliersReference
    ).collect { case (key, Some(value)) => (key, value) }
  }

  def cropImage(sourceFile: File, bounds: Bounds, quality: Double = 100d): Future[File] = {
    for {
      outputFile <- createTempFile(s"crop-", ".jpg")
      cropSource  = imageSource(sourceFile)(quality)
      converted   = profile(cropSource)(imageProfileLocation)
      stripped    = stripMeta(converted)
      profiled    = set(stripped)("profile", imageProfileLocation)
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

  def resizeImage(sourceFile: File, dimensions: Dimensions, quality: Double = 100d): Future[File] = {
    for {
      outputFile  <- createTempFile(s"resize-", ".jpg")
      resizeSource = imageSource(sourceFile)(quality)
      resized      = scale(resizeSource)(dimensions)
      addOutput    = addDestImage(resized)(outputFile)
      _           <- runConvertCmd(addOutput)
    }
    yield outputFile
  }
}
