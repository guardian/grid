package lib.cleanup

import lib.imaging.ImageMetadata


object DropRedundantTitle extends MetadataCleaner {
  override def clean(metadata: ImageMetadata): ImageMetadata = (metadata.title, metadata.description) match {
    case (Some(title), Some(description)) => metadata.copy(title = cleanTitle(title, description))
    case _                                => metadata
  }

  def cleanTitle(title: String, description: String): Option[String] =
    if (description.startsWith(title)) {
      None
    } else {
      Some(title)
    }
}
