package lib.imaging

import java.io._
import java.util.ArrayList

import scala.concurrent.Future

import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.model.{Dimensions, ImageMetadata, Asset}

import lib.Files._
import model.{Bounds, CropSource}


case class ExportResult(id: String, masterCrop: Asset, othersizings: List[Asset])

object ExportOperations {
  import lib.imaging.im4jwrapper.ImageMagick._
  import lib.imaging.im4jwrapper.ExifTool._

  lazy val imageProfileLocation = s"${play.api.Play.current.path}/srgb.icc"

  def tagFilter(metadata: ImageMetadata) = {
    Map[String, Option[String]](
      "Copyright" -> metadata.copyright,
      "CopyrightNotice" -> metadata.copyrightNotice,
      "Credit" -> metadata.credit,
      "OriginalTransmissionReference" -> metadata.suppliersReference
    ).collect { case (key, Some(value)) => (key, value) }
  }

  def extractIdentity(identityArray: ArrayList[String]) ={
    println(identityArray)
  }

  def cropImage(sourceFile: File, bounds: Bounds, qual: Double = 100d): Future[File] = {
    for {
      outputFile <- createTempFile(s"crop-", ".jpg")
      cropSource  = addImage(sourceFile)
      identity   <- identifyCmd(cropSource)
      _           = extractIdentity(identity)
      qualified   = quality(cropSource)(qual)
      converted   = profile(qualified)(imageProfileLocation)
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

  def resizeImage(sourceFile: File, dimensions: Dimensions, qual: Double = 100d): Future[File] = {
    for {
      outputFile  <- createTempFile(s"resize-", ".jpg")
      resizeSource = addImage(sourceFile)
      qualified    = quality(resizeSource)(qual)
      resized      = scale(qualified)(dimensions)
      addOutput    = addDestImage(resized)(outputFile)
      _           <- runConvertCmd(addOutput)
    }
    yield outputFile
  }
}
