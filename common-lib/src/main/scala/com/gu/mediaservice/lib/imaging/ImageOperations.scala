package com.gu.mediaservice.lib.imaging

import java.io._

import org.im4java.core.IMOperation
import com.gu.mediaservice.lib.Files._
import com.gu.mediaservice.lib.StorableThumbImage
import com.gu.mediaservice.lib.imaging.ImageOperations.{optimisedMimeType, thumbMimeType}
import com.gu.mediaservice.lib.imaging.im4jwrapper.ImageMagick.{addImage, format, runIdentifyCmd}
import com.gu.mediaservice.lib.imaging.im4jwrapper.{ExifTool, ImageMagick}
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model._

import scala.concurrent.{ExecutionContext, Future}
import scala.sys.process._


case class ExportResult(id: String, masterCrop: Asset, othersizings: List[Asset])
class UnsupportedCropOutputTypeException extends Exception

class ImageOperations(playPath: String) extends GridLogging {
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

  def cropImage(sourceFile: File, sourceMimeType: Option[MimeType], bounds: Bounds, qual: Double = 100d, tempDir: File,
                iccColourSpace: Option[String], colourModel: Option[String], fileType: MimeType): Future[File] = {
    for {
      outputFile <- createTempFile(s"crop-", s"${fileType.fileExtension}", tempDir)
      cropSource    = addImage(sourceFile)
      qualified     = quality(cropSource)(qual)
      corrected     = correctColour(qualified)(iccColourSpace, colourModel)
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

  def resizeImage(sourceFile: File, sourceMimeType: Option[MimeType], dimensions: Dimensions,
                  qual: Double = 100d, tempDir: File, fileType: MimeType): Future[File] = {
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

  def optimiseImage(resizedFile: File, mediaType: MimeType): File = mediaType match {
    case Png =>
      val fileName: String = resizedFile.getAbsolutePath

      val optimisedImageName: String = fileName.split('.')(0) + "optimised.png"
      Seq("pngquant",  "--quality", "1-85", fileName, "--output", optimisedImageName).!

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

  /**
    * Given a source file containing a png (the 'browser viewable' file),
    * construct a thumbnail file in the provided temp directory, and return
    * the file with metadata about it.
    * @param sourceFile File containing browser viewable (ie not too big or colourful) image
    * @param sourceMimeType Mime time of browser viewable file
    * @param width Desired with of thumbnail
    * @param qual Desired quality of thumbnail
    * @param tempDir Location to create thumbnail file
    * @param iccColourSpace (Approximately) number of colours to use
    * @param colourModel Colour model - eg RGB or CMYK
    * @return The file created and the mimetype of the content of that file, in a future.
    */
  def createThumbnail(sourceFile: File,
                      sourceMimeType: Option[MimeType],
                      width: Int,
                      qual: Double = 100d,
                      tempDir: File,
                      iccColourSpace: Option[String],
                      colourModel: Option[String]): Future[(File, MimeType)] = {
    val cropSource  = addImage(sourceFile)
    val thumbnailed = thumbnail(cropSource)(width)
    val corrected   = correctColour(thumbnailed)(iccColourSpace, colourModel)
    val converted   = applyOutputProfile(corrected, optimised = true)
    val stripped    = stripMeta(converted)
    val profiled    = applyOutputProfile(stripped, optimised = true)
    val unsharpened = unsharp(profiled)(thumbUnsharpRadius, thumbUnsharpSigma, thumbUnsharpAmount)
    val qualified   = quality(unsharpened)(qual)
    val addOutput   = {file:File => addDestImage(qualified)(file)}
    for {
      outputFile <- createTempFile(s"thumb-", thumbMimeType.fileExtension, tempDir)
      _          <- runConvertCmd(addOutput(outputFile), useImageMagick = sourceMimeType.contains(Tiff))
    } yield (outputFile, thumbMimeType)
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
  def transformImage(sourceFile: File, sourceMimeType: Option[MimeType], tempDir: File): Future[(File, MimeType)] = {
    for {
      // png suffix is used by imagemagick to infer the required type
      outputFile      <- createTempFile(s"transformed-", optimisedMimeType.fileExtension, tempDir)
      transformSource = addImage(sourceFile)
      addOutput       = addDestImage(transformSource)(outputFile)
      _               <- runConvertCmd(addOutput, useImageMagick = sourceMimeType.contains(Tiff))
      _               <- checkForOutputFileChange(outputFile)
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

object ImageOperations {
  val thumbMimeType = Jpeg
  val optimisedMimeType = Png
  def identifyColourModel(sourceFile: File, mimeType: MimeType)(implicit ec: ExecutionContext): Future[Option[String]] = {
    // TODO: use mimeType to lookup other properties once we support other formats

    mimeType match {
      case Jpeg =>
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
