package lib

import java.io._
import scala.concurrent.Future

import _root_.play.api.libs.concurrent.Execution.Implicits._
import lib.Files._
import model.{Dimensions, CropSource}

import com.gu.mediaservice.model.ImageMetadata
import model._


object Crops {
  import lib.imaging.Convert._
  import lib.imaging.ExifTool._
  import com.gu.mediaservice.lib.util.Counter


  val cropCounter = new Counter()

  def tagFilter(metadata: ImageMetadata) = {
    Map[String, Option[String]](
      "Copyright" -> metadata.copyright,
      "CopyrightNotice" -> metadata.copyrightNotice,
      "Credit" -> metadata.credit,
      "OriginalTransmissionReference" -> metadata.suppliersReference
    ).collect { case (key, Some(value)) => (key, value) }
  }

  def cropImage(sourceFile: File, bounds: Bounds): Future[File] = {
    for {
      outputFile <- createTempFile(s"crop-${cropCounter.incr}-", ".jpg")
      cropSource  = imageSource(sourceFile)
      stripped    = stripMeta(cropSource)
      cropped     = crop(stripped)(bounds)
      normed      = normalizeColorspace(cropped)
      addOutput   = addDestImage(normed)(outputFile)
      _          <- runConvertCmd(addOutput)
    }
    yield outputFile
  }

  def appendMetadata(sourceFile: File, metadata: ImageMetadata): Future[File] = {
    runExiftoolCmd(
      setTags(tagSource(sourceFile))(tagFilter(metadata))
      ).map(_ => sourceFile)
  }

  def resizeImage(sourceFile: File, dimensions: Dimensions): Future[File] = {
    for {
      outputFile  <- createTempFile(s"resize-${cropCounter.incr}-", ".jpg")
      resizeSource = imageSource(sourceFile)
      resized      = scale(resizeSource)(dimensions)
      addOutput    = addDestImage(resized)(outputFile)
      _           <- runConvertCmd(addOutput)
    }
    yield outputFile
  }
}
