package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

/**
  * Remove any explicit copyright character or string.
  * TODO: Remove processing from copyright field (see PR#2778)
  */
object StripCopyrightPrefix extends MetadataCleaner {

  // Prefix-match any combination of copyright (separated by whitespace)
  val WithoutCopyrightPrefix = """(?i)(?:©|Copyright(?: of)?|\(c\)|\s|:)*(.*)""".r

  override def clean(metadata: ImageMetadata): ImageMetadata =
    metadata.copy(
      byline = metadata.byline.map(stripCopyrightPrefix),
      credit = metadata.credit.map(stripCopyrightPrefix),
    )

  def stripCopyrightPrefix(s: String): String = s match {
    case WithoutCopyrightPrefix(rest) => rest
    case _ => s
  }
}
