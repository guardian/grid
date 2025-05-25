package com.gu.mediaservice.lib.imaging

import com.gu.mediaservice.lib.BrowserViewableImage
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.MimeType

import java.io.File
import scala.concurrent.Future


trait ImageOperations {
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


  def transformImage(sourceFile: File, sourceMimeType: Option[MimeType], tempDir: File)(implicit logMarker: LogMarker): Future[(File, MimeType)]

  def createThumbnail(
    browserViewableImage: BrowserViewableImage,
    width: Int,
    qual: Double = 100d,
    outputFile: File,
    iccColourSpace: Option[String],
    colourModel: Option[String],
    hasAlpha: Boolean
  )(implicit logMarker: LogMarker): Future[(File, MimeType)]
}
