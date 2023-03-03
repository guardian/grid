package com.gu.mediaservice.lib.imaging

import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.{Bounds, Dimensions, MimeType}

import java.io.File
import scala.concurrent.Future

trait ImageOperations {
  def cropImage(
    sourceFile: File,
    sourceMimeType: Option[MimeType],
    bounds: Bounds,
    qual: Double = 100d,
    tempDir: File,
    iccColourSpace: Option[String],
    colourModel: Option[String],
    fileType: MimeType,
    isTransformedFromSource: Boolean
  )(implicit logMarker: LogMarker): Future[File]

  def resizeImage(
    sourceFile: File,
    sourceMimeType: Option[MimeType],
    dimensions: Dimensions,
    scale: Double,
    qual: Double = 100d,
    tempDir: File,
    fileType: MimeType
  )(implicit logMarker: LogMarker): Future[File]

  val playPath: String

  private def profilePath(fileName: String): String = s"$playPath/$fileName"

  private[imaging] val profileLocations = Map(
    "RGB" -> profilePath("srgb.icc"),
    "CMYK" -> profilePath("cmyk.icc"),
    "Greyscale" -> profilePath("grayscale.icc")
  )

  private[imaging] def rgbProfileLocation(optimised: Boolean): String = {
    if (optimised)
      profilePath("facebook-TINYsRGB_c2.icc")
    else
      profilePath("srgb.icc")
  }
}
