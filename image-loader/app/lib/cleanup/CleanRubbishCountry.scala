package lib.cleanup

import lib.imaging.ImageMetadata

object CleanRubbishCountry extends MetadataCleaner {

  val Rubbish = """(\s*[.-]*\s*)""".r

  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.country match {
    // if rubbish country name, strip it
    case Some(Rubbish(_)) => metadata.copy(country = None)
    // otherwise, just pass through
    case _ => metadata
  }
}
