package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

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
