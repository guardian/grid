package model.upload

import com.gu.mediaservice.lib.ImageWrapper
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap, Stopwatch}
import com.gu.mediaservice.model.{FileMetadata, MimeType, Png, Tiff}
import lib.ImageLoaderConfig

import java.io.File
import scala.concurrent.{ExecutionContext, Future}
import scala.sys.process._

trait OptimiseOps {
  def toOptimisedFile(file: File, imageWrapper: ImageWrapper, tempDir: File)
                     (implicit ec: ExecutionContext, logMarker: LogMarker): Future[(File, MimeType)]
  def shouldOptimise(mimeType: MimeType, fileMetadata: FileMetadata): Boolean
}

class OptimiseWithPngQuant(config: ImageLoaderConfig) extends OptimiseOps with GridLogging {

  def toOptimisedFile(file: File, imageWrapper: ImageWrapper, optimisedFile: File)
                     (implicit ec: ExecutionContext, logMarker: LogMarker): Future[(File, MimeType)] = Future {
    val marker = MarkerMap(
      "fileName" -> file.getName()
    )

    Stopwatch("pngquant") {
      val result = Seq("pngquant", "-s10", "--quality", "1-85", file.getAbsolutePath,
        "--force", "--output", optimisedFile.getAbsolutePath
      ).!
      if (result > 0)
        throw new Exception(s"pngquant failed to convert to optimised png file (rc = $result)")
    }(marker)

    if (optimisedFile.exists()) {
      (optimisedFile, ImageOperations.optimisedMimeType)
    } else {
      throw new Exception(s"Attempted to optimise PNG file ${optimisedFile.getPath}")
    }
  }

  def shouldOptimise(mimeType: MimeType, fileMetadata: FileMetadata): Boolean = {
    val shouldBeOptimised = mimeType match {
      case Png =>
        fileMetadata.colourModelInformation.get("colorType") match {
          case Some("True Color") => true
          case Some("True Color with Alpha") => true
          case _ => false
        }
      case Tiff => true // TODO This should be done better, it could be better optimised into a jpeg if there is no transparency.
      case _ => false
    }

    // OptimiseWithPngQuant.toOptimisedFile does not actually make the optimised file from the original file as the interface implies
    // It relies on all the file formats which pass shouldOptimise also have been selected as transcodeMimeTypes
    // and having been converted to PNGs upstream.
    // If Tiff files were not configured in transcodeMimeTypes then pngquant would be
    // past a tif file to quantise and will fail; breaking uploads.
    val canBeOptimisedByOptimiseWithPngQuant = mimeType == Png || config.transcodedMimeTypes.contains(mimeType)
    if (!canBeOptimisedByOptimiseWithPngQuant) {
      logger.warn(s"OptimiseWithPngQuant was asked to optimise a mimetype ($mimeType) which is not a PNG or in transcodedMimeTypes and already been transformed to a PNG")
    }
    shouldBeOptimised && canBeOptimisedByOptimiseWithPngQuant
  }
}
