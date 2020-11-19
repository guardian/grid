package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

/**
  * Generic data cleaner that drops the title from an image if the text matches the start of the description.
  */
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
