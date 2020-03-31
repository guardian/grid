package com.gu.mediaservice.lib.imaging

import java.io._

import org.im4java.core.IMOperation
import com.gu.mediaservice.lib.Files._
import com.gu.mediaservice.lib.imaging.ImageOperations.MimeType
import com.gu.mediaservice.lib.imaging.im4jwrapper.ImageMagick.{addImage, format, runIdentifyCmd}
import com.gu.mediaservice.lib.imaging.im4jwrapper.{ExifTool, ImageMagick}
import com.gu.mediaservice.model.{Asset, Bounds, Dimensions, ImageMetadata}

import scala.concurrent.{ExecutionContext, Future}
import scala.sys.process._


case class ExportResult(id: String, masterCrop: Asset, othersizings: List[Asset])

class ImageOperations(playPath: String) {
  import ExifTool._
  import ImageMagick._

  private def profilePath(fileName: String): String = s"$playPath/$fileName"

  private def profileLocation(colourModel: String, optimised: Boolean = false): String = colourModel match {
    case "RGB" if optimised => profilePath("facebook-TINYsRGB_c2.icc")
    case "RGB"              => profilePath("srgb.icc")
    case "CMYK"             => profilePath("cmyk.icc")
    case "GRAYSCALE"        => profilePath("grayscale.icc")
    case model              => throw new Exception(s"Profile for invalid colour model requested: $model")
  }

  private def tagFilter(metadata: ImageMetadata) = {
    Map[String, Option[String]](
      "Copyright" -> metadata.copyright,
      "CopyrightNotice" -> metadata.copyrightNotice,
      "Credit" -> metadata.credit,
      "OriginalTransmissionReference" -> metadata.suppliersReference
    ).collect { case (key, Some(value)) => (key, value) }
  }

  private def applyOutputProfile(base: IMOperation, optimised: Boolean = false) = profile(base)(profileLocation("RGB", optimised))

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

  def cropImage(sourceFile: File, sourceMimeType: Option[String], bounds: Bounds, qual: Double = 100d, tempDir: File,
                iccColourSpace: Option[String], colourModel: Option[String], fileType: String): Future[File] = {
    for {
      outputFile <- createTempFile(s"crop-", s".${fileType}", tempDir)
      cropSource    = addImage(sourceFile)
      qualified     = quality(cropSource)(qual)
      corrected     = correctColour(qualified)(iccColourSpace, colourModel)
      converted     = applyOutputProfile(corrected)
      stripped      = stripMeta(converted)
      profiled      = applyOutputProfile(stripped)
      cropped       = crop(profiled)(bounds)
      depthAdjusted = depth(cropped)(8)
      addOutput     = addDestImage(depthAdjusted)(outputFile)
      _             <- runConvertCmd(addOutput, useImageMagick = sourceMimeType.contains("image/tiff"))
    }
    yield outputFile
  }

  // Updates metadata on existing file
  def appendMetadata(sourceFile: File, metadata: ImageMetadata): Future[File] = {
    runExiftoolCmd(
      setTags(tagSource(sourceFile))(tagFilter(metadata))
      ).map(_ => sourceFile)
  }

  def resizeImage(sourceFile: File, sourceMimeType: Option[String], dimensions: Dimensions,
                  qual: Double = 100d, tempDir: File, fileType: String): Future[File] = {
    for {
      outputFile  <- createTempFile(s"resize-", s".${fileType}", tempDir)
      resizeSource = addImage(sourceFile)
      qualified    = quality(resizeSource)(qual)
      resized      = scale(qualified)(dimensions)
      addOutput    = addDestImage(resized)(outputFile)
      _           <- runConvertCmd(addOutput, useImageMagick = sourceMimeType.contains("image/tiff"))
    }
    yield outputFile
  }

  def optimiseImage(resizedFile: File, mediaType: MimeType): File =

    mediaType.name match {
      case "image/png" => {
        val fileName: String = resizedFile.getAbsolutePath()

        val optimisedImageName: String = fileName.split('.')(0) + "optimised.png"
        Seq("pngquant",  "--quality", "1-85", fileName, "--output", optimisedImageName).!

        new File(optimisedImageName)

      }
      case "image/jpeg" => resizedFile
    }

  val thumbUnsharpRadius = 0.5d
  val thumbUnsharpSigma = 0.5d
  val thumbUnsharpAmount = 0.8d
  def createThumbnail(sourceFile: File, sourceMimeType: Option[String], width: Int, qual: Double = 100d,
                      tempDir: File, iccColourSpace: Option[String], colourModel: Option[String]): Future[File] = {
    for {
      outputFile <- createTempFile(s"thumb-", ".jpg", tempDir)
      cropSource  = addImage(sourceFile)
      thumbnailed = thumbnail(cropSource)(width)
      corrected   = correctColour(thumbnailed)(iccColourSpace, colourModel)
      converted   = applyOutputProfile(corrected, optimised = true)
      stripped    = stripMeta(converted)
      profiled    = applyOutputProfile(stripped, optimised = true)
      unsharpened = unsharp(profiled)(thumbUnsharpRadius, thumbUnsharpSigma, thumbUnsharpAmount)
      qualified   = quality(unsharpened)(qual)
      addOutput   = addDestImage(qualified)(outputFile)
      _          <- runConvertCmd(addOutput, useImageMagick = sourceMimeType.contains("image/tiff"))
    } yield outputFile
  }

  def transformImage(sourceFile: File, sourceMimeType: Option[String], tempDir: File): Future[File] = {
    for {
      outputFile       <- createTempFile(s"transformed-", ".png", tempDir)
      transformSource   = addImage(sourceFile)
      addOutput         = addDestImage(transformSource)(outputFile)
      _                <- runConvertCmd(addOutput, useImageMagick = sourceMimeType.contains("image/tiff"))
      actualOutputFile <- checkForOutputFileChange(outputFile)
    }
      yield actualOutputFile
  }

  private def checkForOutputFileChange(f: File): Future[File] = Future {
    val f2 = new File(f.getAbsolutePath, f.getName)
    if (f2.exists()) {
      f2
    } else {
      val fileBits = f.getAbsolutePath.split("\\.").toList
      val mainPart = fileBits.dropRight(1).mkString(".")
      val extension = fileBits.last
      val newFile = List(s"${mainPart}-0", extension).mkString(".")
      val f3 = new File(newFile)
      if (f3.exists()) {
        f3
      } else {
        throw new FileNotFoundException(f.getName)
      }
    }
  }


}

object ImageOperations {
  sealed trait MimeType {
    def name: String
    def extension: String
  }

  case object Png extends MimeType {
    val name  = "image/png"
    val extension = "png"
  }

  case object Jpeg extends MimeType {
    val name = "image/jpeg"
    val extension = "jpg"
  }

  def identifyColourModel(sourceFile: File, mimeType: String)(implicit ec: ExecutionContext): Future[Option[String]] = {
    // TODO: use mimeType to lookup other properties once we support other formats

    mimeType match {
      case "image/jpeg" =>
        val source = addImage(sourceFile)
        val formatter = format(source)("%[JPEG-Colorspace-Name]")

        for {
          output <- runIdentifyCmd(formatter)
          colourModel = output.headOption
        } yield colourModel

      case _ =>
        // assume that the colour model is RGB for other image types
        Future.successful(Some("RGB"))
    }
  }
}
