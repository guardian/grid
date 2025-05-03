package com.gu.mediaservice.lib.imaging

import java.io._
import org.im4java.core.IMOperation
import com.gu.mediaservice.lib.Files._
import com.gu.mediaservice.lib.{BrowserViewableImage, StorableThumbImage}
import com.gu.mediaservice.lib.imaging.ImageOperations.{optimisedMimeType, thumbMimeType}
import com.gu.mediaservice.lib.imaging.im4jwrapper.ImageMagick.{addDestImage, addImage, format, runIdentifyCmd}
import com.gu.mediaservice.lib.imaging.im4jwrapper.{ExifTool, ImageMagick}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, Stopwatch, addLogMarkers}
import com.gu.mediaservice.model._

import scala.concurrent.{ExecutionContext, Future}
import scala.sys.process._
import app.photofox.vipsffm.Vips
import app.photofox.vipsffm.VImage
import app.photofox.vipsffm.VipsOption


case class ExportResult(id: String, masterCrop: Asset, othersizings: List[Asset])
class UnsupportedCropOutputTypeException extends Exception

class ImageOperations(playPath: String) extends GridLogging {
  import ExifTool._
  import ImageMagick._

  private def profilePath(fileName: String): String = s"$playPath/$fileName"

  private def rgbProfileLocation(optimised: Boolean): String = {
    if (optimised)
      profilePath("facebook-TINYsRGB_c2.icc")
    else
      profilePath("srgb.icc")
  }

  private val profileLocations = Map(
    "RGB" -> profilePath("srgb.icc"),
    "CMYK" -> profilePath("cmyk.icc"),
    "Greyscale" -> profilePath("grayscale.icc")
  )

  private def tagFilter(metadata: ImageMetadata) = {
    Map[String, Option[String]](
      "Copyright" -> metadata.copyright,
      "Credit" -> metadata.credit,
      "OriginalTransmissionReference" -> metadata.suppliersReference
    ).collect { case (key, Some(value)) => (key, value) }
  }

  private def applyOutputProfile(base: IMOperation, optimised: Boolean = false) = profile(base)(rgbProfileLocation(optimised))

  // Optionally apply transforms to the base operation if the colour space
  // in the ICC profile doesn't match the colour model of the image data
  private def correctColour(base: IMOperation)(iccColourSpace: Option[String], colourModel: Option[String], isTransformedFromSource: Boolean)(implicit logMarker: LogMarker): IMOperation = {
    (iccColourSpace, colourModel, isTransformedFromSource) match {
      // If matching, all is well, just pass through
      case (icc, model, _) if icc == model => base
      // If no colour model detected, we can't do anything anyway so just hope all is well
      case (_,  None, _) => base
      // Do not correct colour if file has already been transformed (ie. source file was TIFF) as correctColour has already been run
      case (_, _, true) => base
      // If mismatching, strip any (incorrect) ICC profile and inject a profile matching the model
      // Note: Strip both ICC and ICM (Windows variant?) to be safe
      case (icc, Some(model), _) =>
        profileLocations.get(model) match {
          // If this is a supported model, strip profile from base and add profile for model
          case Some(location) => profile(stripProfile(base)("icm,icc"))(location)
          // Do not attempt to correct colour if we don't support that colour model
          case None =>
            logger.warn(
              logMarker,
              s"Wanted to update colour model where iccColourSpace=$icc and colourModel=$model but we don't have a profile file for that model"
            )
            base
        }
    }
  }

  def cropImage(
    sourceFile: File,
    sourceMimeType: Option[MimeType],
    bounds: Bounds,
    qual: Double = 100d,
    tempDir: File,
    iccColourSpace: Option[String],
    colourModel: Option[String],
    fileType: MimeType,
    isTransformedFromSource: Boolean,
    orientationMetadata: Option[OrientationMetadata]
  )(implicit logMarker: LogMarker): Future[File] = Stopwatch.async("magick crop image") {
    for {
      outputFile <- createTempFile(s"crop-", s"${fileType.fileExtension}", tempDir)
      cropSource    = addImage(sourceFile)
      oriented      = orient(cropSource, orientationMetadata)
      qualified     = quality(oriented)(qual)
      corrected     = correctColour(qualified)(iccColourSpace, colourModel, isTransformedFromSource)
      converted     = applyOutputProfile(corrected)
      stripped      = stripMeta(converted)
      profiled      = applyOutputProfile(stripped)
      cropped       = crop(profiled)(bounds)
      depthAdjusted = depth(cropped)(8)
      addOutput     = addDestImage(depthAdjusted)(outputFile)
      _             <- runConvertCmd(addOutput, useImageMagick = sourceMimeType.contains(Tiff))
      _             <- checkForOutputFileChange(outputFile)
    }
    yield outputFile
  }

  // Updates metadata on existing file
  def appendMetadata(sourceFile: File, metadata: ImageMetadata): Future[File] = {
    runExiftoolCmd(
      setTags(tagSource(sourceFile))(tagFilter(metadata))
      ).map(_ => sourceFile)
  }

  def resizeImage(
    sourceFile: File,
    sourceMimeType: Option[MimeType],
    dimensions: Dimensions,
    qual: Double = 100d,
    tempDir: File,
    fileType: MimeType
  )(implicit logMarker: LogMarker): Future[File] = Stopwatch.async("magick resize image") {
    for {
      outputFile  <- createTempFile(s"resize-", s".${fileType.fileExtension}", tempDir)
      resizeSource = addImage(sourceFile)
      qualified    = quality(resizeSource)(qual)
      resized      = scale(qualified)(dimensions)
      addOutput    = addDestImage(resized)(outputFile)
      _           <- runConvertCmd(addOutput, useImageMagick = sourceMimeType.contains(Tiff))
    }
    yield outputFile
  }

  private def orient(op: IMOperation, orientationMetadata: Option[OrientationMetadata]): IMOperation = {
    logger.info("Correcting for orientation: " + orientationMetadata)
    orientationMetadata.map(_.orientationCorrection()) match {
      case Some(angle) => rotate(op)(angle)
      case _ => op
    }
  }

  def optimiseImage(resizedFile: File, mediaType: MimeType)(implicit logMarker: LogMarker): File = mediaType match {
    case Png =>
      val fileName: String = resizedFile.getAbsolutePath

      val optimisedImageName: String = fileName.split('.')(0) + "optimised.png"
      Stopwatch("pngquant") {
        Seq("pngquant", "-s10", "--quality", "1-85", fileName, "--output", optimisedImageName).!
      }

      new File(optimisedImageName)
    case Jpeg => resizedFile

    // This should never happen as we only ever crop as PNG or JPEG. See `Crops.cropType` and `CropsTest`
    // TODO We should create a `CroppingMimeType` to enforce this at the type level.
    //  However we'd need to change the `Asset` model as source image and crop use this model
    //  and a source can legally be a `Tiff`. It's not a small change...
    case Tiff =>
      logger.error("Attempting to optimize a Tiff crop. Cropping as Tiff is not supported.")
      throw new UnsupportedCropOutputTypeException
  }

  val thumbUnsharpRadius = 0.5d
  val thumbUnsharpSigma = 0.5d
  val thumbUnsharpAmount = 0.8d
  val interlacedHow = "Line"
  val backgroundColour = "#333333"

  /**
    * Given a source file containing an image (the 'browser viewable' file),
    * construct a thumbnail file in the provided temp directory, and return
    * the file with metadata about it.
    * @param browserViewableImage
    * @param width Desired with of thumbnail
    * @param qual Desired quality of thumbnail
    * @param outputFile Location to create thumbnail file
    * @param iccColourSpace (Approximately) number of colours to use
    * @param colourModel Colour model - eg RGB or CMYK
    * @return The file created and the mimetype of the content of that file, in a future.
    */
  def createThumbnail(browserViewableImage: BrowserViewableImage,
                      width: Int,
                      qual: Double = 100d,
                      outputFile: File,
                      iccColourSpace: Option[String],
                      colourModel: Option[String],
                      orientationMetadata: Option[OrientationMetadata]
  )(implicit logMarker: LogMarker): Future[(File, MimeType)] = {
    val stopwatch = Stopwatch.start

    val cropSource     = addImage(browserViewableImage.file)
    val orientated     = orient(cropSource, orientationMetadata)
    val thumbnailed    = thumbnail(orientated)(width)
    val corrected      = correctColour(thumbnailed)(iccColourSpace, colourModel, false)
    val converted      = applyOutputProfile(corrected, optimised = true)
    val stripped       = stripMeta(converted)
    val profiled       = applyOutputProfile(stripped, optimised = true)
    val withBackground = setBackgroundColour(profiled)(backgroundColour)
    val flattened      = flatten(withBackground)
    val unsharpened    = unsharp(flattened)(thumbUnsharpRadius, thumbUnsharpSigma, thumbUnsharpAmount)
    val qualified      = quality(unsharpened)(qual)
    val interlaced     = interlace(qualified)(interlacedHow)
    val addOutput      = {file:File => addDestImage(interlaced)(file)}
    for {
      _          <- runConvertCmd(addOutput(outputFile), useImageMagick = false)
      _ = logger.info(addLogMarkers(stopwatch.elapsed), "Finished creating thumbnail")
    } yield (outputFile, thumbMimeType)
  }
  Vips.init()

  def createThumbnailVips(browserViewableImage: BrowserViewableImage,
                      width: Int,
                      qual: Double = 100d,
                      outputFile: File,
                      iccColourSpace: Option[String],
                      colourModel: Option[String],
                      orientationMetadata: Option[OrientationMetadata]
                     )(implicit logMarker: LogMarker): Future[(File, MimeType)] = {


    Future.successful {
      Vips.run { arena =>
        val thumbnail = VImage.thumbnail(arena, browserViewableImage.file.getAbsolutePath, width,
          VipsOption.Boolean("auto-rotate", false), // example of an option,
        )

        thumbnail.jpegsave(outputFile.getAbsolutePath,
          VipsOption.Int("Q", qual.toInt),
          //VipsOption.Boolean("optimize-scans", true),
          //VipsOption.Boolean("optimize-coding", true),
          //VipsOption.Boolean("interlace", true),
          //VipsOption.Boolean("trellis-quant", true),
          // VipsOption.Int("quant-table", 3),
          VipsOption.Boolean("strip", true)
        )
      }

      (outputFile, MimeType("image/jpeg"))
    }
  }

  /**
    * Given a source file containing a file which requires optimising to make it suitable for viewing in
    * a browser, construct a new image file in the provided temp directory, and return
    * * the file with metadata about it.
    * @param sourceFile File containing browser viewable (ie not too big or colourful) image
    * @param sourceMimeType Mime time of browser viewable file
    * @param tempDir Location to create optimised file
    * @return The file created and the mimetype of the content of that file, in a future.
    */
  def transformImage(sourceFile: File, sourceMimeType: Option[MimeType], tempDir: File)(implicit logMarker: LogMarker): Future[(File, MimeType)] = {
    val stopwatch = Stopwatch.start
    for {
      // png suffix is used by imagemagick to infer the required type
      outputFile      <- createTempFile(s"transformed-", optimisedMimeType.fileExtension, tempDir)
      transformSource = addImage(sourceFile)
      converted       = applyOutputProfile(transformSource, optimised = true)
      stripped        = stripMeta(converted)
      profiled        = applyOutputProfile(stripped, optimised = true)
      depthAdjusted   = depth(profiled)(8)
      addOutput       = addDestImage(depthAdjusted)(outputFile)
      _               <- runConvertCmd(addOutput, useImageMagick = sourceMimeType.contains(Tiff))
      _               <- checkForOutputFileChange(outputFile)
      _ = logger.info(addLogMarkers(stopwatch.elapsed), "Finished creating browser-viewable image")
    } yield (outputFile, optimisedMimeType)
  }

  // When a layered tiff is unpacked, the temp file (blah.something) is moved
  // to blah-0.something and contains the composite layer (which is what we want).
  // Other layers are then saved as blah-1.something etc.
  // As the file has been renamed, the file object still exists, but has the wrong name
  // We will need to put it back where it is expected to be found, and clean up the other
  // files.
  private def checkForOutputFileChange(f: File): Future[Unit] = Future {
    val fileBits = f.getAbsolutePath.split("\\.").toList
    val mainPart = fileBits.dropRight(1).mkString(".")
    val extension = fileBits.last

    // f2 is the blah-0 name that gets created from a layered tiff.
    val f2 = new File(List(s"$mainPart-0", extension).mkString("."))
    if (f2.exists()) {
      // f HAS been renamed to blah-0.  Rename it right back!
      f2.renameTo(f)
      // Tidy up any other files (blah-1,2,3 etc will be created for each subsequent layer)
      cleanUpLayerFiles(mainPart, extension, 1)
    }
  }

  @scala.annotation.tailrec
  private def cleanUpLayerFiles(mainPart: String, extension: String, index: Int):Unit = {
     val newFile = List(s"$mainPart-$index", extension).mkString(".")
     val f3 = new File(newFile)
     if (f3.exists()) {
       f3.delete()
       cleanUpLayerFiles(mainPart, extension, index+1)
     }
  }

}

object ImageOperations extends GridLogging {
  val thumbMimeType = Jpeg
  val optimisedMimeType = Png
  def identifyColourModel(sourceFile: File, mimeType: MimeType)(implicit ec: ExecutionContext, logMarker: LogMarker): Future[Option[String]] = {
    // TODO: use mimeType to lookup other properties once we support other formats
    val stopWatch = Stopwatch.start
    (mimeType match {
      case Jpeg =>
        val source = addImage(sourceFile)
        val formatter = format(source)("%[JPEG-Colorspace-Name]")

        for {
          output <- runIdentifyCmd(formatter, false)
          colourModel = output.headOption
        } yield colourModel match {
          case Some("GRAYSCALE") => Some("Greyscale")
          case Some("CMYK") => Some("CMYK")
          case _ => Some("RGB")
        }
      case Tiff =>
        val op = new IMOperation()
        val formatter = format(op)("%[colorspace]")
        val withSource = addDestImage(formatter)(sourceFile)

        for {
          output <- runIdentifyCmd(withSource, true)
          colourModel = output.headOption
        } yield colourModel match {
          case Some("sRGB") => Some("RGB")
          case Some("Gray") => Some("Greyscale")
          case Some("CIELab") => Some("LAB")
          // IM returns doubles for TIFFs with transparency…
          case Some("sRGBsRGB") => Some("RGB")
          case Some("GrayGray") => Some("Greyscale")
          case Some("CIELabCIELab") => Some("LAB")
          case Some("CMYKCMYK") => Some("CMYK")
          // …and triples for TIFFs with transparency and alpha channel(s). I think.
          case Some("sRGBsRGBsRGB") => Some("RGB")
          case Some("GrayGrayGray") => Some("Greyscale")
          case Some("CIELabCIELabCIELab") => Some("LAB")
          case Some("CMYKCMYKCMYK") => Some("CMYK")
          case _ => colourModel
        }
      case Png =>
        val op = new IMOperation()
        val formatter = format(op)("%[colorspace]")
        val withSource = addDestImage(formatter)(sourceFile)

        for {
          output <- runIdentifyCmd(withSource, true)
          colourModel = output.headOption
        } yield colourModel match {
          case Some("sRGB") => Some("RGB")
          case Some("Gray") => Some("Greyscale")
          case _ => Some("RGB")
        }
      case _ =>
        // assume that the colour model is RGB for other image types
        Future.successful(Some("RGB"))
    }).map { result =>
      logger.info(addLogMarkers(stopWatch.elapsed), "Finished identifyColourModel")
      result
    }
  }
}
