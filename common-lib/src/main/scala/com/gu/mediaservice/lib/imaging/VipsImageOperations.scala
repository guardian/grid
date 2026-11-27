package com.gu.mediaservice.lib.imaging

import app.photofox.vipsffm.enums.{VipsIntent, VipsInterpretation}
import app.photofox.vipsffm.jextract.VipsRaw
import app.photofox.vipsffm.{VImage, Vips, VipsHelper, VipsOption}
import com.gu.mediaservice.lib.BrowserViewableImage
import com.gu.mediaservice.lib.imaging.im4jwrapper.ExifTool.{runExiftoolCmd, setTags, tagSource}
import com.gu.mediaservice.lib.imaging.im4jwrapper.ImageMagick.ctx
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model._

import java.awt.color.{ColorSpace, ICC_Profile}
import java.io._
import java.lang.foreign.Arena
import scala.concurrent.Future
import scala.util.Try


class VipsImageOperations(playPath: String) extends GridLogging with ImageOperations {

  Vips.init()
  VipsHelper.cache_set_max(0)

  private val thumbnailBackground: java.util.List[java.lang.Double] = java.util.List.of(0x33.toDouble, 0x33.toDouble, 0x33.toDouble)

  private val profileLocations = Map(
    "RGB" -> s"$playPath/srgb.icc",
    "CMYK" -> s"$playPath/cmyk.icc",
    "Greyscale" -> s"$playPath/grayscale.icc"
  )

  private def outputProfile(optimised: Boolean): String =
    if (optimised) s"$playPath/facebook-TINYsRGB_c2.icc" else profileLocations("RGB")

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

        val master = correctForICCProfile(cropped)

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
        val image = VImage.newFromFile(arena, browserViewableImage.file.getAbsolutePath)
        val inputProfile = decodedColourModel(image).flatMap(profileLocations.get).map { profile =>
          VipsOption.String("input-profile", profile)
        }.toSeq
        val options: Seq[VipsOption] = Seq(
          VipsOption.Boolean("no-rotate", true),
          VipsOption.Enum("intent", VipsIntent.INTENT_PERCEPTUAL),
          VipsOption.String("output-profile", outputProfile(optimised = true))
        ) ++ inputProfile
        val thumbnail = VImage.thumbnail(arena, browserViewableImage.file.getAbsolutePath, width,
          options: _*
        )

        val inMemoryCopy = thumbnail.copyMemory()

        val rotated = orientationMetadata.map(_.orientationCorrection()).map { angle =>
          logger.info("Rotating thumbnail: " + angle)
          inMemoryCopy.rotate(angle)
        }.getOrElse{
          inMemoryCopy
        }

        val flattened = if (rotated.hasAlpha) {
          rotated.flatten(VipsOption.ArrayDouble("background", thumbnailBackground))
        } else {
          rotated
        }

        saveImageToFile(flattened, ImageOperations.thumbMimeType, qual, outputFile)
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

        val correctedForICCProfile = correctForICCProfile(image, optimised = true)

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

        decodedColourModel(image)
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
    val k = keep.getOrElse(VipsRaw.VIPS_FOREIGN_KEEP_ICC)
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
            VipsOption.Int("bitdepth", 8),
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

  private def decodedColourModel(image: VImage): Option[String] = {
    val interpretation = VipsHelper.image_get_interpretation(image.getUnsafeStructAddress)
    VipsInterpretation.values().find(_.getRawValue == interpretation) match {
      case Some(VipsInterpretation.INTERPRETATION_B_W | VipsInterpretation.INTERPRETATION_GREY16) => Some("Greyscale")
      case Some(VipsInterpretation.INTERPRETATION_CMYK) => Some("CMYK")
      case Some(VipsInterpretation.INTERPRETATION_LAB | VipsInterpretation.INTERPRETATION_LABS) => Some("LAB")
      case Some(VipsInterpretation.INTERPRETATION_RGB | VipsInterpretation.INTERPRETATION_RGB16 | VipsInterpretation.INTERPRETATION_sRGB) => Some("RGB")
      case _ => None
    }
  }

  private def correctForICCProfile(image: VImage, optimised: Boolean = false): VImage = {
    // Source metadata can describe the original TIFF rather than the already-transformed image.
    val model = decodedColourModel(image)
    val embeddedModel = Option(image.getBlob("icc-profile-data"))
      .flatMap(profile => Try(ICC_Profile.getInstance(profile.getBytes).getColorSpaceType).toOption)
      .flatMap {
        case ColorSpace.TYPE_RGB => Some("RGB")
        case ColorSpace.TYPE_CMYK => Some("CMYK")
        case ColorSpace.TYPE_GRAY => Some("Greyscale")
        case ColorSpace.TYPE_Lab => Some("LAB")
        case _ => None
      }
    val useEmbedded = model.isDefined && model == embeddedModel
    val source = if (useEmbedded) {
      image
    } else {
      val withoutProfile = image.copy()
      withoutProfile.remove("icc-profile-data")
      // Unprofiled LAB is already device-independent; treating its samples as RGB corrupts the colours.
      if (model.exists(profileLocations.contains)) withoutProfile
      else withoutProfile.colourspace(VipsInterpretation.INTERPRETATION_sRGB)
    }
    source.iccTransform(outputProfile(optimised),
      VipsOption.Boolean("embedded", useEmbedded),
      VipsOption.String("input-profile", model.flatMap(profileLocations.get).getOrElse(profileLocations("RGB"))),
      VipsOption.Enum("intent", VipsIntent.INTENT_PERCEPTUAL),
      VipsOption.Int("depth", 8)
    )
  }

  private def createTempFileInTempDir(prefix: String, fileType: MimeType, tempDir: File): File = {
    File.createTempFile(s"$prefix-", fileType.fileExtension, tempDir)
  }

}
