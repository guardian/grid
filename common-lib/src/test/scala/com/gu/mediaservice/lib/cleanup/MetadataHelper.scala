package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

trait MetadataHelper {
  def createImageMetadata(metadata: (String, String)*): ImageMetadata =
    createImageMetadata(metadata.toMap)

  def createImageMetadata(metadata: Map[String, String]): ImageMetadata =
    ImageMetadata(
      dateTaken           = None,
      description         = metadata.get("description"),
      credit              = metadata.get("credit"),
      byline              = metadata.get("byline"),
      bylineTitle         = metadata.get("bylineTitle"),
      title               = metadata.get("title"),
      copyrightNotice     = metadata.get("copyrightNotice"),
      copyright           = metadata.get("copyright"),
      supplier            = metadata.get("supplier"),
      collection          = metadata.get("collection"),
      suppliersReference  = metadata.get("suppliersReference"),
      source              = metadata.get("source"),
      specialInstructions = metadata.get("specialInstructions"),
      keywords            = List(),
      subLocation         = metadata.get("subLocation"),
      city                = metadata.get("city"),
      state               = metadata.get("state"),
      country             = metadata.get("country")
    )
}
