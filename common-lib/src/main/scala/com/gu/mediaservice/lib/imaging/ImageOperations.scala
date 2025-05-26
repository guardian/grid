package com.gu.mediaservice.lib.imaging

import app.photofox.vipsffm.enums.{VipsIntent, VipsInterpretation}
import app.photofox.vipsffm.{VImage, VipsHelper, VipsOption}
import com.gu.mediaservice.lib.BrowserViewableImage
import com.gu.mediaservice.lib.imaging.ImageOperations.thumbMimeType
import com.gu.mediaservice.lib.imaging.im4jwrapper.{ExifTool, ImageMagick}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, Stopwatch, addLogMarkers}
import com.gu.mediaservice.model._
import org.im4java.core.IMOperation

import java.io._
import java.lang.foreign.Arena
import scala.concurrent.{ExecutionContext, Future}


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

  def cropImageVips(
                     sourceFile: File,
                     bounds: Bounds,
                     orientationMetadata: Option[OrientationMetadata]
                   )(implicit logMarker: LogMarker, arena: Arena): VImage = {
    // Read source image
    val image = VImage.newFromFile(arena, sourceFile.getAbsolutePath)
    val maybeInterpretation = VipsInterpretation.values().toSeq.find(_.getRawValue == VipsHelper.image_get_interpretation(image.getUnsafeStructAddress))

    // Orient
    val rotated = orientationMetadata.map(_.orientationCorrection()).map { angle =>
      image.rotate(angle)
    }.getOrElse {
      image
    }
    // TODO strip meta data
    // Output colour profile
    val cropped = rotated.extractArea(bounds.x, bounds.y, bounds.width, bounds.height)
    // TODO depth adjust

    val labInterpretations = Set (
      VipsInterpretation.INTERPRETATION_LAB,
      VipsInterpretation.INTERPRETATION_LABS
    )

    val isLab = maybeInterpretation.exists(interpretation => labInterpretations.contains(interpretation))
    val corrected = if (!isLab) {
      cropped.iccTransform("srgb",
        VipsOption.Enum("intent",VipsIntent.INTENT_PERCEPTUAL),     // Helps with CMYK; see https://github.com/libvips/libvips/issues/1110
        VipsOption.Int("depth", getDepthFor(image))
      )
    } else {
      // LAB gets corrupted by icc_transform something about with no profile?
      cropped
    }

    val master = corrected
    master
  }


  // Updates metadata on existing file
  def appendMetadata(sourceFile: File, metadata: ImageMetadata): Future[File] = {
    runExiftoolCmd(
      setTags(tagSource(sourceFile))(tagFilter(metadata))
      ).map(_ => sourceFile)
  }

  def resizeImageVips(
                       sourceImage: VImage,
                       dimensions: Dimensions,
                       qual: Double = 100d,
                       tempDir: File,
                       fileType: MimeType,
                       sourceDimensions: Dimensions
                     )(implicit logMarker: LogMarker, arena: Arena): File = {

    val scale = dimensions.width.toDouble / sourceDimensions.width.toDouble
    val resized = sourceImage.resize(scale)

    val outputFile = File.createTempFile(s"resize-", s"${fileType.fileExtension}", tempDir) // TODO function for this
    saveImageToFile(resized, fileType, qual, outputFile, quantise = true)
  }

  private def orient(op: IMOperation, orientationMetadata: Option[OrientationMetadata]): IMOperation = {
    logger.info("Correcting for orientation: " + orientationMetadata)
    orientationMetadata.map(_.orientationCorrection()) match {
      case Some(angle) => rotate(op)(angle)
      case _ => op
    }
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
          VipsOption.Enum("intent",VipsIntent.INTENT_PERCEPTUAL),
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

  def saveImageToFile(image: VImage, mimeType: MimeType, qual: Double, outputFile: File, quantise: Boolean = false): File = {
    logger.info(s"Saving image as $mimeType to file: " + outputFile.getAbsolutePath)
    mimeType match {
      case Jpeg =>
        image.jpegsave(outputFile.getAbsolutePath,
          VipsOption.Int("Q", qual.toInt),
          //VipsOption.Boolean("optimize-scans", true),
          //VipsOption.Boolean("optimize-coding", true),
          //VipsOption.Boolean("interlace", true),
          //VipsOption.Boolean("trellis-quant", true),
          // VipsOption.Int("quant-table", 3),
          VipsOption.Boolean("strip", true)
        )
        outputFile

      case Png =>
        // Bit used in save must match used in transform
        val depth: Int = getDepthFor(image)

        // We are allowed to quantise PNG crops but not the master
        if (quantise) {
          image.pngsave(outputFile.getAbsolutePath,
            VipsOption.Boolean("palette", true),
            VipsOption.Int("Q", qual.toInt),
            VipsOption.Int("effort", 1),
            VipsOption.Boolean("strip", true)
          )
        } else {
          image.pngsave(outputFile.getAbsolutePath,
            VipsOption.Int("Q", qual.toInt),
            VipsOption.Int("bitdepth", depth),
            VipsOption.Boolean("strip", true)
          )
        }
        outputFile

      case _ =>
        logger.error(s"Save to $mimeType is not supported.")
        throw new UnsupportedCropOutputTypeException
    }
  }

  private def getDepthFor(image: VImage) = {
    val sixteenBitInterpretations = Set(
      VipsInterpretation.INTERPRETATION_GREY16,
      VipsInterpretation.INTERPRETATION_LABS,
      VipsInterpretation.INTERPRETATION_RGB16
    )

    val maybeInterpretation = VipsInterpretation.values().toSeq.find(_.getRawValue == VipsHelper.image_get_interpretation(image.getUnsafeStructAddress))
    val depth = maybeInterpretation.map { interpretation =>
      if (sixteenBitInterpretations.contains(interpretation)) {
        16
      } else {
        8
      }
    }.getOrElse(8)
    logger.info(s"Depth for interpretation $maybeInterpretation is $depth")
    depth
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
        println(maybeInterpretation)
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
