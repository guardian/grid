package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

case class AttributeCreditFromByline(bylines: List[String], credit: String) extends MetadataCleaner {

  val lowercaseBylines = bylines.map(_.toLowerCase)

  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.byline match {
    case Some(byline) if lowercaseBylines.contains(byline.toLowerCase) => metadata.copy(credit = Some(credit))
    case _ => metadata
  }
}
