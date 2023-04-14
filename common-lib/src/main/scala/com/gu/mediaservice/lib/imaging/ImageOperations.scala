package com.gu.mediaservice.lib.imaging


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
}
