package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

object StripFromNullUnicodeChar extends MetadataCleaner {
  val unicodeChar = "\u0000"

  def stripFromNullUnicodeChar(s: String): Option[String] = {
    s.split(unicodeChar).headOption
  }

  override def clean(metadata: ImageMetadata): ImageMetadata =
    metadata.copy(
      source = metadata.source.flatMap(stripFromNullUnicodeChar),
      byline = metadata.byline.flatMap(stripFromNullUnicodeChar)
    )
}
