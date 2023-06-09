package com.gu.mediaservice.lib.imaging.vips

import com.gu.mediaservice.model.Bounds

import java.io.File
import scala.util.Try

final case class VipsPngsaveQuantise(
  quality: Int,
  effort: Int,
  bitdepth: Int
)

object Vips {
  // this should only be run once per process - please keep it inside a singleton `object`!
  LibVips.INSTANCE.vips_init("")

  //noinspection AccessorLikeMethodIsEmptyParen
  private def getErrors(): String = LibVips.INSTANCE.vips_error_buffer_copy()

  def openFile(file: File): Try[VipsImage] = Try {
    val image = LibVips.INSTANCE.vips_image_new_from_file(file.getAbsolutePath)
    if (image == null) {
      throw new Exception(s"Failed to open image file ${file.getName} - libvips returned error(s) ${getErrors()}")
    }
    image
  }

  def extractArea(image: VipsImage, bounds: Bounds): Try[VipsImage] = Try {
    val cropOutput = new VipsImageByReference()
    if (LibVips.INSTANCE.vips_extract_area(image, cropOutput, bounds.x, bounds.y, bounds.width, bounds.height) != 0) {
      throw new Exception(s"Failed to crop image - libvips return error(s) ${getErrors()}")
    }
    cropOutput.getValue
  }

  def resize(image: VipsImage, scale: Double): Try[VipsImage] = Try {
    val resizeOutput = new VipsImageByReference()
    if (LibVips.INSTANCE.vips_resize(image, resizeOutput, scale) != 0) {
      throw new Exception(s"Failed to resize image - libvips returned error(s) ${getErrors()}")
    }
    resizeOutput.getValue
  }

  def saveJpeg(image: VipsImage, outputFile: File, quality: Int, profile: String): Try[Unit] = {
    reinterpret(image).map { srgbed =>
      val profileTransformed = new VipsImageByReference()
      if (LibVips.INSTANCE.vips_icc_transform(srgbed, profileTransformed, profile,
        "embedded", 1.asInstanceOf[Integer],
        "intent", 0.asInstanceOf[Integer], // VIPS_INTENT_PERCEPTUAL
        "black_point_compensation", 1.asInstanceOf[Integer]) != 0) {
        throw new Exception(s"Failed to save file to Jpeg - conversion to $profile failed ${getErrors()}")
      }

      val args = Seq("Q", quality.asInstanceOf[Integer], "strip", 1.asInstanceOf[Integer], "profile", profile)

      if (LibVips.INSTANCE.vips_jpegsave(profileTransformed.getValue, outputFile.getAbsolutePath, args: _*) != 0) {
        throw new Exception(s"Failed to save file to Jpeg - libvips returned error ${getErrors()}")
      }
    }
  }

  /**
   * Check Libvips' interpretation of the image: if black/white, send to SRGB colourspace, otherwise return unchanged
   * @param image
   * @return
   */
  private def reinterpret(image: VipsImage): Try[VipsImage] = Try {
    val interpretation = VipsInterpretation.fromValue(LibVips.INSTANCE.vips_image_guess_interpretation(image))

    if (interpretation == VipsInterpretation.VIPS_INTERPRETATION_B_W) {
      val reinterpreted = new VipsImageByReference()
      if (LibVips.INSTANCE.vips_colourspace(image, reinterpreted, VipsInterpretation.VIPS_INTERPRETATION_sRGB.value) != 0) {
        throw new Exception(s"Failed to move from B/W colourspace to sRGB - ${getErrors()}")
      }
      reinterpreted.getValue
    } else {
      image
    }

  }

  def savePng(
    image: VipsImage,
    outputFile: File,
    profile: String,
    quantisation: Option[VipsPngsaveQuantise] = None,
  ): Try[Unit] = {
    reinterpret(image).map { srgbed =>
      val profileTransformed = new VipsImageByReference()
      if (LibVips.INSTANCE.vips_icc_transform(srgbed, profileTransformed, profile,
        "embedded", 1.asInstanceOf[Integer],
        "intent", 0.asInstanceOf[Integer], // VIPS_INTENT_PERCEPTUAL
        "black_point_compensation", 1.asInstanceOf[Integer]) != 0) {
        throw new Exception(s"Failed to save file to Png - conversion to $profile failed ${getErrors()}")
      }

      val args = Seq("strip", 1.asInstanceOf[Integer], "profile", profile) ++
        quantisation.toSeq.flatMap(qargs => Seq(
          "palette", 1.asInstanceOf[Integer],
          "Q", qargs.quality.asInstanceOf[Integer],
          "effort", qargs.effort.asInstanceOf[Integer],
          "bitdepth", qargs.bitdepth.asInstanceOf[Integer]
        ))

      if (LibVips.INSTANCE.vips_pngsave(profileTransformed.getValue, outputFile.getAbsolutePath, args: _*) != 0) {
        throw new Exception(s"Failed to save file to Png - libvips returned error ${getErrors()}")
      }
    }
  }

  def thumbnail(file: File, width: Int): Try[VipsImage] = Try {
    val output = new VipsImageByReference()
    if (LibVips.INSTANCE.vips_thumbnail(file.getAbsolutePath, output, width.asInstanceOf[Integer],
    "no_rotate", 1.asInstanceOf[Integer], "intent", 0.asInstanceOf[Integer], // VIPS_INTENT_PERCEPTUAL
    ) != 0) {
      throw new Exception(s"Failed to create thumbnail - ${getErrors()}")
    }

    output.getValue
  }
}
