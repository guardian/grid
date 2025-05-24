package com.gu.mediaservice.lib.imaging

import app.photofox.vipsffm.enums.VipsInterpretation

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
import app.photofox.vipsffm.{VImage, Vips, VipsHelper, VipsOption}

import java.lang.foreign.Arena


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

  def cropImageVips(
                     sourceFile: File,
                     sourceMimeType: Option[MimeType],
                     bounds: Bounds,
                     qual: Double = 100d,
                     tempDir: File,
                     iccColourSpace: Option[String],
                     fileType: MimeType,
                     isTransformedFromSource: Boolean,
                     orientationMetadata: Option[OrientationMetadata]
                   )(implicit logMarker: LogMarker, arena: Arena): (File, VImage) = {
    // Read source image
    val image = VImage.newFromFile(arena, sourceFile.getAbsolutePath)
    // Orient
    val rotated = orientationMetadata.map(_.orientationCorrection()).map { angle =>
      image.rotate(angle)
    }.getOrElse {
      image
    }
    // TODO correct colour
    // TODO strip meta data
    // Output colour profile
    val cropped = rotated.extractArea(bounds.x, bounds.y, bounds.width, bounds.height)
    // TODO depth adjust

    val corrected = cropped.colourspace(VipsInterpretation.INTERPRETATION_sRGB)

    val master = corrected

    // TODO separate this local file create from the vips master image create
    val outputFile = File.createTempFile(s"crop-", s"${fileType.fileExtension}", tempDir) // TODO function for this
    logger.info("Saving master crop tmp file to: " + outputFile.getAbsolutePath)
    master.jpegsave(outputFile.getAbsolutePath,
      VipsOption.Int("Q", qual.toInt),
      //VipsOption.Boolean("optimize-scans", true),
      //VipsOption.Boolean("optimize-coding", true),
      //VipsOption.Boolean("interlace", true),
      //VipsOption.Boolean("trellis-quant", true),
      // VipsOption.Int("quant-table", 3),
      VipsOption.Boolean("strip", true)
    )

    (outputFile, master)
  }


  // Updates metadata on existing file
  def appendMetadata(sourceFile: File, metadata: ImageMetadata): Future[File] = {
    runExiftoolCmd(
      setTags(tagSource(sourceFile))(tagFilter(metadata))
      ).map(_ => sourceFile)
  }

  def resizeImageVips(
                       sourceImage: VImage,
                       sourceMimeType: Option[MimeType],
                       dimensions: Dimensions,
                       qual: Double = 100d,
                       tempDir: File,
                       fileType: MimeType,
                       sourceDimensions: Dimensions
                     )(implicit logMarker: LogMarker, arena: Arena): File = {

    val scale = dimensions.width.toDouble / sourceDimensions.width.toDouble
    val resized = sourceImage.resize(scale)

    val outputFile = File.createTempFile(s"resize-", s".${fileType.fileExtension}", tempDir) // TODO function for this
    logger.info("Saving resized crop as JPEG tmp file to: " + outputFile.getAbsolutePath)

    fileType match {
      case Jpeg =>
        resized.jpegsave(outputFile.getAbsolutePath,
          VipsOption.Int("Q", qual.toInt),
          //VipsOption.Boolean("optimize-scans", true),
          //VipsOption.Boolean("optimize-coding", true),
          //VipsOption.Boolean("interlace", true),
          //VipsOption.Boolean("trellis-quant", true),
          // VipsOption.Int("quant-table", 3),
          VipsOption.Boolean("strip", false)
        )
        outputFile

      case Png =>
        // val optimisedImageName: String = fileName.split('.')(0) + "optimised.png"
        //      Seq("pngquant","-s8",  "--quality", "1-85", fileName, "--output", optimisedImageName).!
        resized.pngsave(outputFile.getAbsolutePath,
          VipsOption.Int("Q", qual.toInt),
          VipsOption.Boolean("strip", false)
        )
        outputFile

      case _ =>
        logger.error(s"Cropping to $fileType is not supported.")
        throw new UnsupportedCropOutputTypeException
    }
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

  val interlacedHow = "Line"
  val backgroundColour = "#333333"

  /**
   * Given a source file containing an image (the 'browser viewable' file),
   * construct a thumbnail file in the provided temp directory, and return
   * the file with metadata about it.
   *
   * @param browserViewableImage
   * @param width               Desired with of thumbnail
   * @param qual                Desired quality of thumbnail
   * @param outputFile          Location to create thumbnail file
   * @param orientationMetadata OrientationMetadata for rotation correction
   * @return The file created and the mimetype of the content of that file and it's dimensions, in a future.
   */
  def createThumbnailVips(browserViewableImage: BrowserViewableImage,
                      width: Int,
                      qual: Double = 100d,
                      outputFile: File,
                      orientationMetadata: Option[OrientationMetadata]
                     )(implicit logMarker: LogMarker): Future[(File, MimeType, Option[Dimensions])] = {
    val stopwatch = Stopwatch.start

    Future.successful {
      var thumbDimensions: Option[Dimensions] = None
      val arena = Arena.ofConfined

      try {
        val thumbnail = VImage.thumbnail(arena, browserViewableImage.file.getAbsolutePath, width,
          VipsOption.Boolean("auto-rotate", false),
          VipsOption.String("export-profile", profilePath("srgb.icc"))
        )
        val rotated = orientationMetadata.map(_.orientationCorrection()).map { angle =>
          logger.info("Rotating thumbnail: " + angle)
          thumbnail.rotate(angle)
        }.getOrElse {
          thumbnail
        }
        logger.info("Created thumbnail: " + rotated.getWidth + "x" + rotated.getHeight)
        thumbDimensions = Some(Dimensions(rotated.getWidth, rotated.getHeight))
        rotated.jpegsave(outputFile.getAbsolutePath,
          VipsOption.Int("Q", qual.toInt),
          //VipsOption.Boolean("optimize-scans", true),
          //VipsOption.Boolean("optimize-coding", true),
          //VipsOption.Boolean("interlace", true),
          //VipsOption.Boolean("trellis-quant", true),
          // VipsOption.Int("quant-table", 3),
          VipsOption.Boolean("strip", true)
        )
      } catch {
        case e: Exception =>
          logger.error("Error during createThumbnail", e)
          throw e
      }
      arena.close()

      logger.info(addLogMarkers(stopwatch.elapsed), "Finished creating thumbnail")
      (outputFile, thumbMimeType, thumbDimensions)
    }
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

  def getImageInformation(sourceFile: File)(implicit ec: ExecutionContext, logMarker: LogMarker): Future[(Option[Dimensions], Option[OrientationMetadata], Option[String], Map[String, String])] = {
    val stopwatch = Stopwatch.start
    Future {
      var dimensions: Option[Dimensions] = None
      var maybeExifOrientationWhichTransformsImage: Option[OrientationMetadata] = None
      var colourModel: Option[String] = None
      var colourModelInformation: Map[String, String] = Map.empty

      val arena = Arena.ofConfined
      try {
        val image = VImage.newFromFile(arena, sourceFile.getAbsolutePath)

        dimensions = Some(Dimensions(width = image.getWidth, height = image.getHeight))

        val exifOrientation = VipsHelper.image_get_orientation(image.getUnsafeStructAddress)
        val orientation = Some(OrientationMetadata(
          exifOrientation = Some(exifOrientation)
        ))
        maybeExifOrientationWhichTransformsImage = Seq(orientation).flatten.find(_.transformsImage())

        // TODO better way to go straight from int to enum?
        val maybeInterpretation = VipsInterpretation.values().toSeq.find(_.getRawValue == VipsHelper.image_get_interpretation(image.getUnsafeStructAddress))
        colourModel = maybeInterpretation match {
          case Some(VipsInterpretation.INTERPRETATION_B_W) => Some("Greyscale")
          case Some(VipsInterpretation.INTERPRETATION_CMYK) => Some("CMYK")
          case Some(VipsInterpretation.INTERPRETATION_LAB) => Some("LAB")
          case Some(VipsInterpretation.INTERPRETATION_LABS) => Some("LAB")
          case Some(VipsInterpretation.INTERPRETATION_RGB16) => Some("RGB")
          case Some(VipsInterpretation.INTERPRETATION_sRGB) => Some("RGB")
          case _ => None
        }

        colourModelInformation = Map {
          "hasAlpha" -> image.hasAlpha.toString
        }
      } catch {
        case e: Exception =>
          logger.error("Error during getImageInformation", e)
          throw e
      }
      arena.close()

      (dimensions, maybeExifOrientationWhichTransformsImage, colourModel, colourModelInformation)
    }.map { result =>
      logger.info(addLogMarkers(stopwatch.elapsed), "Finished getImageInformation")
      result
    }
  }

}
