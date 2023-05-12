package com.gu.mediaservice.lib.imaging.vips

import com.gu.mediaservice.model.Bounds

import java.io.File
import scala.util.Try

final case class VipsPngsaveQuantise(
  quality: Int,
  dither: Double,
)

object Vips {
  // this should only be run once per process - please keep it inside a singleton `object`!
  LibVips.INSTANCE.vips_init("")

  //noinspection AccessorLikeMethodIsEmptyParen
  private def getErrors(): String = LibVips.INSTANCE.vips_error_buffer_copy()

  def openFile(file: File): Try[VipsImage] = Try {
    val image = LibVips.INSTANCE.vips_image_new_from_file(file.getAbsolutePath)
    if (image == null) {
      throw new Error(s"Failed to open image file ${file.getName} - libvips returned error(s) ${getErrors()}")
    }
    image
  }

  def extractArea(image: VipsImage, bounds: Bounds): Try[VipsImage] = Try {
    val cropOutput = new VipsImageByReference()
    if (LibVips.INSTANCE.vips_extract_area(image, cropOutput, bounds.x, bounds.y, bounds.width, bounds.height) != 0) {
      throw new Error(s"Failed to crop image - libvips return error(s) ${getErrors()}")
    }
    cropOutput.getValue
  }

  def resize(image: VipsImage, scale: Double): Try[VipsImage] = Try {
    val resizeOutput = new VipsImageByReference()
    if (LibVips.INSTANCE.vips_resize(image, resizeOutput, scale) != 0) {
      throw new Error(s"Failed to resize image - libvips returned error(s) ${getErrors()}")
    }
    resizeOutput.getValue
  }

  def saveJpeg(image: VipsImage, outputFile: File, quality: Int, profile: String): Try[Unit] = Try {
    val profileTransformed = new VipsImageByReference()
    if (LibVips.INSTANCE.vips_icc_transform(image, profileTransformed, profile,
      "embedded", 1.asInstanceOf[Integer],
      "intent", 0.asInstanceOf[Integer], // VIPS_INTENT_PERCEPTUAL
      "black_point_compensation", 1.asInstanceOf[Integer]) != 0)
    {
      throw new Error(s"Failed to save file to Jpeg - conversion to $profile failed ${getErrors()}")
    }

    val args = Seq("Q", quality.asInstanceOf[Integer], "strip", 1.asInstanceOf[Integer], "profile", profile)

    if (LibVips.INSTANCE.vips_jpegsave(profileTransformed.getValue, outputFile.getAbsolutePath, args:_*) != 0) {
      throw new Error(s"Failed to save file to Jpeg - libvips returned error ${getErrors()}")
    }
  }

  def savePng(
    image: VipsImage,
    outputFile: File,
    profile: String,
    quantisation: Option[VipsPngsaveQuantise] = None,
    bitdepth: Option[Int] = None
  ): Try[Unit] = Try {
    val profileTransformed = new VipsImageByReference()
    if (LibVips.INSTANCE.vips_icc_transform(image, profileTransformed, profile,
      "embedded", 1.asInstanceOf[Integer],
      "intent", 0.asInstanceOf[Integer], // VIPS_INTENT_PERCEPTUAL
      "black_point_compensation", 1.asInstanceOf[Integer]) != 0) {
      throw new Error(s"Failed to save file to Jpeg - conversion to $profile failed ${getErrors()}")
    }

    val args = Seq("strip", 1.asInstanceOf[Integer], "profile", profile) ++
      quantisation.toSeq.flatMap(qargs => Seq("Q", qargs.quality.asInstanceOf[Integer], "dither", qargs.dither.asInstanceOf[java.lang.Double])) ++
      bitdepth.toSeq.flatMap(bd => Seq("bitdepth", bd.asInstanceOf[Integer]))

    if (LibVips.INSTANCE.vips_pngsave(profileTransformed.getValue, outputFile.getAbsolutePath, args:_*) != 0) {
      throw new Error(s"Failed to save file to Png - libvips returned error ${getErrors()}")
    }
  }

  def thumbnail(file: File, width: Int): Try[VipsImage] = Try {
    val output = new VipsImageByReference()
    if (LibVips.INSTANCE.vips_thumbnail(file.getAbsolutePath, output, width.asInstanceOf[Integer],
    "no_rotate", 1.asInstanceOf[Integer], "intent", 0.asInstanceOf[Integer], // VIPS_INTENT_PERCEPTUAL
    ) != 0) {
      throw new Error(s"Failed to create thumbnail - ${getErrors()}")
    }

    output.getValue
  }
}
