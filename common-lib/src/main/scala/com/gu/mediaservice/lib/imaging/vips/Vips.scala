package com.gu.mediaservice.lib.imaging.vips

import com.gu.mediaservice.model.Bounds

import java.io.File
import scala.util.Try


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

  def saveJpeg(image: VipsImage, outputFile: File, quality: Int): Try[Unit] = Try {
    if (LibVips.INSTANCE.vips_jpegsave(image, outputFile.getAbsolutePath, "Q", quality.asInstanceOf[Integer], "strip", 1.asInstanceOf[Integer]) != 0) {
      throw new Error(s"Failed to save file to Jpeg - libvips returned error ${getErrors()}")
    }
  }

  def extractArea(sourceFile: File, outputFile: File, bounds: Bounds, qual: Double): Try[Unit] = {
    for {
      image <- openFile(sourceFile)
      croppedImage <- extractArea(image, bounds)
      // TODO support other output filetypes
      _ <- saveJpeg(croppedImage, outputFile, qual.toInt)
    } yield ()
  }

  def resize(sourceFile: File, outputFile: File, scale: Double, qual: Double): Try[Unit] = {
    for {
      image <- openFile(sourceFile)
      resizedImage <- resize(image, scale)
      // TODO support other output filetypes
      _ <- saveJpeg(resizedImage, outputFile, qual.toInt)
    } yield ()
  }

}
