package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

/*
 * Guardian specific logic for internal consistency (possibly originally for importing old images)
 * TODO: Merge into styleguide rule?
 */
object UseCanonicalGuardianCredit extends MetadataCleaner {

  // Map "Guardian" credit (old style) to canonical "The Guardian"
  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.credit match {
    case Some("Guardian") => metadata.copy(credit = Some("The Guardian"))
    case _                => metadata
  }
}
