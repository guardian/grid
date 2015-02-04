package lib.cleanup

import lib.imaging.ImageMetadata
import lib.cleanup.StripCopyrightPrefix.stripCopyrightPrefix

object CreditBylineReorganise extends MetadataCleaner {

  val SpaceySlashes = """\s?\/\s?""".r

  override def clean(metadata: ImageMetadata): ImageMetadata = {
    metadata.copy(
      credit = cleanField(metadata.credit),
      byline = cleanField(metadata.byline)
    )
  }

  def cleanField(field: Option[String]) =
    field
      .map(stripCopyrightPrefix)
      .map(condenseSpaceySlashes)

  def condenseSpaceySlashes(s: String): String = SpaceySlashes.replaceAllIn(s, "/")
}
