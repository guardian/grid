package com.gu.mediaservice.lib.imaging

import app.photofox.vipsffm.enums.{VipsIntent, VipsInterpretation}
import app.photofox.vipsffm.jextract.VipsRaw
import app.photofox.vipsffm.{VImage, Vips, VipsHelper, VipsOption}
import com.gu.mediaservice.lib.BrowserViewableImage
import com.gu.mediaservice.lib.imaging.im4jwrapper.ExifTool.{runExiftoolCmd, setTags, tagSource}
import com.gu.mediaservice.lib.imaging.im4jwrapper.ImageMagick.ctx
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model._

import java.io._
import java.lang.foreign.Arena
import scala.concurrent.Future


class VipsImageOperations extends GridLogging with ImageOperations {

  Vips.init()
  VipsHelper.cache_set_max(0)

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
               )(implicit logMarker: LogMarker): Future[File] = {
    Future {
      implicit val arena: Arena = Arena.ofConfined

      try {
        val image = VImage.newFromFile(arena, sourceFile.getAbsolutePath)

        val rotated = orientationMetadata.map(_.orientationCorrection()).map { angle =>
          image.rotate(angle)
        }.getOrElse {
          image
        }

        val cropped = rotated.extractArea(bounds.x, bounds.y, bounds.width, bounds.height)

        // If we saw and ICC profile than we will need to transform
        val correctedForICCProfile = correctForICCProfile(cropped)

        val master = correctedForICCProfile

        val outputFile = createTempFileInTempDir("crop", fileType, tempDir)
        saveImageToFile(master, fileType, qual, outputFile, quantise = false, keep = None)
        outputFile

      } catch {
        case e: Exception =>
          logger.error(logMarker, "Error while cropping image", e)
          throw e
      } finally {
        arena.close()
      }
    }
  }

  def appendMetadata(sourceFile: File, metadata: ImageMetadata): Future[File] = {
    def tagFilter(metadata: ImageMetadata): Map[String, String] = {
      Map[String, Option[String]](
        "Copyright" -> metadata.copyright,
        "Credit" -> metadata.credit,
        "OriginalTransmissionReference" -> metadata.suppliersReference
      ).collect { case (key, Some(value)) => (key, value) }
    }

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
                 )(implicit logMarker: LogMarker): Future[File] = {
    Future {
      val arena = Arena.ofConfined
      try {
        val image = VImage.newFromFile(arena, sourceFile.getAbsolutePath)

        val scale = dimensions.width.toDouble / image.getWidth.toDouble
        val resized = image.resize(scale)

        val outputFile = createTempFileInTempDir("resize", fileType, tempDir)
        logger.info("Saving resized crop as JPEG tmp file to: " + outputFile.getAbsolutePath)

        saveImageToFile(resized, fileType, qual, outputFile, quantise = false, keep = Some(VipsRaw.VIPS_FOREIGN_KEEP_ALL()))  // TODO quantise false because it is still optimiseOps's decision
        outputFile

      } catch {
        case e: Exception =>
          logger.error(logMarker, "Error while creating resizeImage", e)
          throw e
      } finally {
        arena.close()
      }
    }
  }

  def optimiseCrop(resizedFile: File, mediaType: MimeType)(implicit logMarker: LogMarker): File = {
    logger.info(s"optimiseCrop called on {${resizedFile.getAbsolutePath} with crop mediaType: $mediaType")
    // The pipeline has offered this step as a chance to do any additional operations on output crop file; like quantising PNGs
    // If no optimisations are required then the file was returned unaltered.
    // PNGs are lossless so we can safely follow what the existing pipeline does here.
    val output = mediaType match {
      case Png =>
        val fileName = resizedFile.getAbsolutePath
        val optimisedImageName = fileName.split('.')(0) + "optimised.png"

        logger.info(s"Resaving PNG ${resizedFile.getAbsolutePath} with quantise=true")
        val arena = Arena.ofConfined()
        try {
          val image = VImage.newFromFile(arena, resizedFile.getAbsolutePath)
          val output = new File(optimisedImageName)
          saveImageToFile(image, mediaType, 85, output, quantise = true, keep = Some(VipsRaw.VIPS_FOREIGN_KEEP_ALL))
          output
        } catch {
          case e: Exception =>
            logger.error(logMarker, "Error while creating thumbnail", e)
            throw e
        } finally {
          arena.close()
        }
      case _ =>
        // no-op for anything other than PNGs
        resizedFile
    }
    output
  }

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

  def transformImage(sourceFile: File, sourceMimeType: Option[MimeType], tempDir: File)(implicit logMarker: LogMarker): Future[(File, MimeType)] = {
    Future {
      implicit val arena: Arena = Arena.ofConfined
      try {
        val outputFile = createTempFileInTempDir("transformed", optimisedMimeType, tempDir)
        val image = VImage.newFromFile(arena, sourceFile.getAbsolutePath)

        val correctedForICCProfile = correctForICCProfile(image)

        saveImageToFile(correctedForICCProfile, optimisedMimeType, 85.0, outputFile, quantise = false)
        (outputFile, optimisedMimeType)

      } catch {
        case e: Exception =>
          logger.error("Error during createThumbnail", e)
          throw e
      } finally {
        arena.close()
      }
    }
  }

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

  def isGraphic(image: VImage)(implicit arena: Arena): Boolean = {
    // Indexed plus alpha would be 2 bands
    val numberOfBands = VipsHelper.image_get_bands(image.getUnsafeStructAddress)
    val format = VipsHelper.image_get_format(image.getUnsafeStructAddress)
    val paletteType = VipsHelper.image_get_typeof(arena, image.getUnsafeStructAddress, "palette")

    val isGraphic = paletteType > 0 || numberOfBands < 3
    logger.info(s" isGraphic = $isGraphic: Number of bands: $numberOfBands, Format: $format, Palette type: $paletteType")
    isGraphic
  }

  def saveImageToFile(image: VImage, mimeType: MimeType, qual: Double, outputFile: File, quantise: Boolean = false, keep: Option[Int] = None): File = {
    logger.info(s"Saving image as $mimeType to file: " + outputFile.getAbsolutePath + s" as ${mimeType.name}")
    val k = keep.getOrElse(VipsRaw.VIPS_FOREIGN_KEEP_NONE)
    mimeType match {
      case Jpeg =>
        image.jpegsave(outputFile.getAbsolutePath,
          VipsOption.Int("Q", qual.toInt),
          VipsOption.Boolean("optimize-coding", true),
          VipsOption.Int("keep", k)
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
            VipsOption.Int("keep", k)
          )
        } else {
          image.pngsave(outputFile.getAbsolutePath,
            //VipsOption.Int("compression", 6),
            VipsOption.Int("keep", k)
          )
        }
        outputFile

      case _ =>
        logger.error(s"Save to $mimeType is not supported.")
        throw new UnsupportedCropOutputTypeException
    }
  }

  private def correctForICCProfile(image: VImage)(implicit arena: Arena): VImage = {
    val needsICCTransform = VipsHelper.image_get_typeof(arena, image.getUnsafeStructAddress, "icc-profile-data") != 0
    if (needsICCTransform) {
      image.iccTransform("srgb",
        VipsOption.Enum("intent", VipsIntent.INTENT_PERCEPTUAL), // Helps with CMYK; see https://github.com/libvips/libvips/issues/1110
      )
    } else {
      // LAB gets corrupted by a needless icc_transform
      image
    }
  }

  private def createTempFileInTempDir(prefix: String, fileType: MimeType, tempDir: File): File = {
    File.createTempFile(s"$prefix-", fileType.fileExtension, tempDir)
  }

}
