package com.gu.mediaservice.lib.imaging

import app.photofox.vipsffm.enums.{VipsIntent, VipsInterpretation}
import app.photofox.vipsffm.{VImage, VipsHelper, VipsOption}
import com.gu.mediaservice.lib.BrowserViewableImage
import com.gu.mediaservice.lib.imaging.im4jwrapper.ImageMagick.ctx
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model._

import java.io._
import java.lang.foreign.Arena
import scala.concurrent.Future


class VipsImageOperations extends GridLogging with ImageOperations {

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
               )(implicit logMarker: LogMarker): Future[File] = ???

  def appendMetadata(sourceFile: File, metadata: ImageMetadata): Future[File] = ???

  def resizeImage(
                   sourceFile: File,
                   sourceMimeType: Option[MimeType],
                   dimensions: Dimensions,
                   qual: Double = 100d,
                   tempDir: File,
                   fileType: MimeType
                 )(implicit logMarker: LogMarker): Future[File] = ???

  def optimiseCrop(resizedFile: File, mediaType: MimeType)(implicit logMarker: LogMarker): File = ???

  def createThumbnail(browserViewableImage: BrowserViewableImage,
                      width: Int,
                      qual: Double = 100d,
                      outputFile: File,
                      iccColourSpace: Option[String],
                      colourModel: Option[String],
                      orientationMetadata: Option[OrientationMetadata]
                     )(implicit logMarker: LogMarker): Future[(File, MimeType)] = {
    Future {
      val arena = Arena.ofConfined()
      try {
        val thumbnail = VImage.thumbnail(arena, browserViewableImage.file.getAbsolutePath, width,
          VipsOption.Boolean("auto-rotate", false),
          VipsOption.Enum("intent",VipsIntent.INTENT_PERCEPTUAL),
          VipsOption.String("export-profile", "srgb")
        )

        val inMemoryCopy = thumbnail.copyMemory()

        val rotated = orientationMetadata.map(_.orientationCorrection()).map { angle =>
          logger.info("Rotating thumbnail: " + angle)
          inMemoryCopy.rotate(angle)
        }.getOrElse{
          inMemoryCopy
        }

        saveImageToFile(rotated, ImageOperations.thumbMimeType, qual, outputFile)
        (outputFile, thumbMimeType)
      } catch {
        case e: Exception =>
          logger.error(logMarker, "Error while creating thumbnail", e)
          throw e
      } finally {
        arena.close()
      }
    }
  }

  def transformImage(sourceFile: File, sourceMimeType: Option[MimeType], tempDir: File)(implicit logMarker: LogMarker): Future[(File, MimeType)] = ???

  def identifyColourModel(sourceFile: File, mimeType: MimeType)(implicit logMarker: LogMarker): Future[Option[String]] = {
    Future {
      val arena = Arena.ofConfined()
      try {
        val image = VImage.newFromFile(arena, sourceFile.getAbsolutePath)

        val interpretationRawValue = VipsHelper.image_get_interpretation(image.getUnsafeStructAddress)
        // TODO better way to go straight from int to enum?
        val maybeInterpretation = VipsInterpretation.values().toSeq.find(_.getRawValue == interpretationRawValue)
        maybeInterpretation match {
          case Some(VipsInterpretation.INTERPRETATION_B_W) => Some("Greyscale")
          case Some(VipsInterpretation.INTERPRETATION_CMYK) => Some("CMYK")
          case Some(VipsInterpretation.INTERPRETATION_LAB) => Some("LAB")
          case Some(VipsInterpretation.INTERPRETATION_LABS) => Some("LAB")
          case Some(VipsInterpretation.INTERPRETATION_RGB16) => Some("RGB")
          case Some(VipsInterpretation.INTERPRETATION_sRGB) => Some("RGB")
          case _ => None
        }
      } catch {
        case e: Exception =>
          logger.error(logMarker, "Error during identifyColourModel", e)
          throw e
      } finally {
        arena.close()
      }
    }
  }

  def dimensions(sourceFile: File)(implicit logMarker: LogMarker): Future[Option[Dimensions]] = {
    Future {
      val arena = Arena.ofConfined()
      try {
        val image = VImage.newFromFile(arena, sourceFile.getAbsolutePath)
        val width = image.getWidth
        val height = image.getHeight
        Some(Dimensions(width = width, height = height))
      } catch {
        case e: Exception =>
          logger.error(logMarker, "Error during dimensions", e)
          throw e
      } finally {
        arena.close()
      }
    }
  }

  def orientation(sourceFile: File): Future[Option[OrientationMetadata]] = {
    Future {
      val arena = Arena.ofConfined()
      try {
        val image = VImage.newFromFile(arena, sourceFile.getAbsolutePath)
        val exifOrientation = VipsHelper.image_get_orientation(image.getUnsafeStructAddress)
        val orientation = Some(OrientationMetadata(
          exifOrientation = Some(exifOrientation)
        ))
        Seq(orientation).flatten.find(_.transformsImage())
      } catch {
        case e: Exception =>
          logger.error("Error during orientation", e)
          throw e
      } finally {
        arena.close()
      }
    }
  }

  def hasAlpha(image: VImage)(implicit arena: Arena): Boolean = image.hasAlpha

  private def saveImageToFile(image: VImage, mimeType: MimeType, qual: Double, outputFile: File, quantise: Boolean = false): File = {
    logger.info(s"Saving image as $mimeType to file: " + outputFile.getAbsolutePath)
    mimeType match {
      case Jpeg =>
        image.jpegsave(outputFile.getAbsolutePath,
          VipsOption.Int("Q", qual.toInt),
          VipsOption.Boolean("optimize-coding", true),
          VipsOption.Boolean("strip", true)
        )
        outputFile

      case Png =>
        // We are allowed to quantise PNG crops but not the master
        if (quantise) {
          // In libvips Q sets the quality target for the PNG quantiser. The range is 0–100 and the default is 100.
          // A lower Q lets the quantiser use fewer colours and accept more error. You get a smaller, lossier file with more banding.
          // Magick used the quality parameter as the effort, so the value of 1 supplied by pngCropQuality is inappropriate and we will ignore it
          image.pngsave(outputFile.getAbsolutePath,
            VipsOption.Boolean("palette", true),
            VipsOption.Int("Q", 70),
            //VipsOption.Int("effort", 7),
            //VipsOption.Int("compression", 6),
            VipsOption.Int("bitdepth", 8),
            VipsOption.Boolean("strip", true)
          )
        } else {
          image.pngsave(outputFile.getAbsolutePath,
            //VipsOption.Int("compression", 6),
            VipsOption.Boolean("strip", true)
          )
        }
        outputFile

      case _ =>
        logger.error(s"Save to $mimeType is not supported.")
        throw new UnsupportedCropOutputTypeException
    }
  }

}
