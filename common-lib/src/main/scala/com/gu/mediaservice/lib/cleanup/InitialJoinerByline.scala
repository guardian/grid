package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

/**
  * Guardian style, depends on the GuardianStyleByline and the CapitaliseByline processors
  */
object InitialJoinerByline extends MetadataCleaner {
  // Squish together pairs of dangling initials. For example: "C P Scott" -> "CP Scott"
  override def clean(metadata: ImageMetadata): ImageMetadata = {
    metadata.copy(
      byline = metadata.byline.map(_.replaceAll("\\b(\\p{Lu})\\s(\\p{Lu}(\\s|$))", "$1$2"))
    )
  }
}
