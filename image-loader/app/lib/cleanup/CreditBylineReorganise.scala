package lib.cleanup

import lib.imaging.ImageMetadata
import lib.cleanup.StripCopyrightPrefix.stripCopyrightPrefix

object CreditBylineReorganise extends MetadataCleaner {

  override def clean(metadata: ImageMetadata): ImageMetadata =
    metadata.copy(
      credit = metadata.credit.map(stripCopyrightPrefix),
      byline = metadata.byline.map(stripCopyrightPrefix)
    )
}
