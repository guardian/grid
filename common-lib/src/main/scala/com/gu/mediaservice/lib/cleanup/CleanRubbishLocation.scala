package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

/*
  Cleans a small number of values that denote 'no value' - these are dropped to None
  TODO: This could be applied to all fields in metadata (according to Akash/Mateusz)
 */
object CleanRubbishLocation extends MetadataCleaner {

  val Rubbish = """(\s*[.-]*\s*)""".r

  override def clean(metadata: ImageMetadata): ImageMetadata =
    metadata.copy(
      subLocation = metadata.subLocation.flatMap(cleanRubbish),
      city        = metadata.city.flatMap(cleanRubbish),
      state       = metadata.state.flatMap(cleanRubbish),
      country     = metadata.country.flatMap(cleanRubbish)
    )

  def cleanRubbish(s: String): Option[String] = s match {
    case Rubbish(_) => None
    case _ => Some(s)
  }
}
