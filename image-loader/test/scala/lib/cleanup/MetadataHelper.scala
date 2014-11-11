package scala.lib.cleanup

import lib.imaging.ImageMetadata

trait MetadataHelper {
  def createImageMetadata(metadata: (String, String)*): ImageMetadata =
    createImageMetadata(metadata.toMap)

  def createImageMetadata(metadata: Map[String, String]): ImageMetadata =
    ImageMetadata(
      description         = metadata.get("description"),
      credit              = metadata.get("credit"),
      byline              = metadata.get("byline"),
      title               = metadata.get("title"),
      copyrightNotice     = metadata.get("copyrightNotice"),
      copyright           = metadata.get("copyright"),
      suppliersReference  = metadata.get("suppliersReference"),
      source              = metadata.get("source"),
      specialInstructions = metadata.get("specialInstructions"),
      keywords            = List(),
      city                = metadata.get("city"),
      country             = metadata.get("country")
    )
}
