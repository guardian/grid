package com.gu.mediaservice.lib.imaging

import java.io._

import org.im4java.core.IMOperation

import com.gu.mediaservice.lib.Files._
import com.gu.mediaservice.lib.imaging.im4jwrapper.{ExifTool, ImageMagick}
import com.gu.mediaservice.model.{Asset, Bounds, Dimensions, ImageMetadata}
import play.api.libs.concurrent.Execution.Implicits._

import scala.concurrent.Future


case class ExportResult(id: String, masterCrop: Asset, othersizings: List[Asset])

object ImageOperations {
  import ExifTool._
  import ImageMagick._

  private def profilePath(fileName: String): String = s"${play.api.Play.current.path}/$fileName"

  private def profileLocation(colourModel: String): String = colourModel match {
    case "RGB"       => profilePath("srgb.icc")
    case "CMYK"      => profilePath("cmyk.icc")
    case "GRAYSCALE" => profilePath("grayscale.icc")
    case model       => throw new Exception(s"Profile for invalid colour model requested: $model")
  }

  private def tagFilter(metadata: ImageMetadata) = {
    Map[String, Option[String]](
      "Copyright" -> metadata.copyright,
      "CopyrightNotice" -> metadata.copyrightNotice,
      "Credit" -> metadata.credit,
      "OriginalTransmissionReference" -> metadata.suppliersReference
    ).collect { case (key, Some(value)) => (key, value) }
  }

  private def applyOutputProfile(base: IMOperation) = profile(base)(profileLocation("RGB"))

  def identifyColourModel(sourceFile: File, mimeType: String): Future[Option[String]] = {
    val source    = addImage(sourceFile)
    // TODO: use mimeType to lookup other properties once we support other formats
    val formatter = format(source)("%[JPEG-Colorspace-Name]")
    for {
      output      <- runIdentifyCmd(formatter)
      colourModel  = output.headOption
    } yield colourModel
  }

  // Optionally apply transforms to the base operation if the colour space
  // in the ICC profile doesn't match the colour model of the image data
  private def correctColour(base: IMOperation)(iccColourSpace: Option[String], colourModel: Option[String]) = {
    (iccColourSpace, colourModel) match {
      // If matching, all is well, just pass through
      case (icc, model) if icc == model => base
      // If no colour model detected, we can't do anything anyway so just hope all is well
      case (_,   None) => base
      // If mismatching, strip any (incorrect) ICC profile and inject a profile matching the model
      // Note: Strip both ICC and ICM (Windows variant?) to be safe
      case (_,   Some(model)) => profile(stripProfile(base)("icm,icc"))(profileLocation(model))
    }
  }

  def cropImage(sourceFile: File, bounds: Bounds, qual: Double = 100d, tempDir: File,
                iccColourSpace: Option[String], colourModel: Option[String]): Future[File] = {
    for {
      outputFile <- createTempFile(s"crop-", ".jpg", tempDir)
      cropSource  = addImage(sourceFile)
      qualified   = quality(cropSource)(qual)
      corrected   = correctColour(qualified)(iccColourSpace, colourModel)
      converted   = applyOutputProfile(corrected)
      stripped    = stripMeta(converted)
      profiled    = applyOutputProfile(stripped)
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

  def resizeImage(sourceFile: File, dimensions: Dimensions, qual: Double = 100d, tempDir: File): Future[File] = {
    for {
      outputFile  <- createTempFile(s"resize-", ".jpg", tempDir)
      resizeSource = addImage(sourceFile)
      qualified    = quality(resizeSource)(qual)
      resized      = scale(qualified)(dimensions)
      addOutput    = addDestImage(resized)(outputFile)
      _           <- runConvertCmd(addOutput)
    }
    yield outputFile
  }
}
