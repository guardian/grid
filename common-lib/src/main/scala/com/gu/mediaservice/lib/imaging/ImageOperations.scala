package com.gu.mediaservice.lib.imaging

import com.gu.mediaservice.lib.BrowserViewableImage
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model._

import java.io.File
import scala.concurrent.Future

object ImageOperations extends GridLogging {
  val thumbMimeType: MimeType = Jpeg
  val optimisedMimeType: MimeType = Png

  private val ImplementationConfigKey = "image.operations.implementation"
  private val VipsOption = "vips"
  private val MagickOption = "magick"

  def apply(config: CommonConfig, playPath: String): ImageOperations = {
    val implementation = config.stringDefault(ImplementationConfigKey, MagickOption)
    logger.info(s"Using $implementation image operations")
    implementation match {
      case VipsOption => new VipsImageOperations()
      case MagickOption => new MagickImageOperations(playPath)
      case other => throw new IllegalArgumentException(
        s"Unknown $ImplementationConfigKey '$other'; expected one of: $VipsOption, $MagickOption")
    }
  }
}

trait ImageOperations {

  val thumbMimeType: MimeType = ImageOperations.thumbMimeType
  val optimisedMimeType: MimeType = ImageOperations.optimisedMimeType

  def appendMetadata(sourceFile: File, metadata: ImageMetadata): Future[File]

  def createThumbnail(browserViewableImage: BrowserViewableImage,
                      width: Int,
                      qual: Double = 100d,
                      outputFile: File,
                      iccColourSpace: Option[String],
                      colourModel: Option[String],
                      orientationMetadata: Option[OrientationMetadata]
                     )(implicit logMarker: LogMarker): Future[(File, MimeType)]

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
               )(implicit logMarker: LogMarker): Future[File]

  def optimiseCrop(resizedFile: File, mediaType: MimeType)(implicit logMarker: LogMarker): File

  def resizeImage(
                   sourceFile: File,
                   sourceMimeType: Option[MimeType],
                   dimensions: Dimensions,
                   qual: Double = 100d,
                   tempDir: File,
                   fileType: MimeType
                 )(implicit logMarker: LogMarker): Future[File]

  def transformImage(sourceFile: File, sourceMimeType: Option[MimeType], tempDir: File)(implicit logMarker: LogMarker): Future[(File, MimeType)]

  def identifyColourModel(sourceFile: File, mimeType: MimeType)(implicit logMarker: LogMarker): Future[Option[String]]

}

