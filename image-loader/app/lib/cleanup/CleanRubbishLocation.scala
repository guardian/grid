package lib.cleanup

import lib.imaging.ImageMetadata

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
