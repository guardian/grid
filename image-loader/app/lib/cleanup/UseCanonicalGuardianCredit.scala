package lib.cleanup

import lib.imaging.ImageMetadata

object UseCanonicalGuardianCredit extends MetadataCleaner {

  // Map "Guardian" credit (old style) to canonical "The Guardian"
  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.credit match {
    case Some("Guardian") => metadata.copy(credit = Some("The Guardian"))
    case _                => metadata
  }
}
