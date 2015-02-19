package lib.cleanup

import lib.imaging.ImageMetadata

object ExtractGuardianCreditFromByline extends MetadataCleaner {

  val BylineForTheGuardian = """(?i)(.+) for the (Guardian|Observer)[.]?""".r

  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.byline match {
    case Some(BylineForTheGuardian(byline, org)) => {
      val orgName = org.toLowerCase.capitalize
      metadata.copy(byline = Some(byline), credit = Some(s"The $orgName"))
    }
    case _ => metadata
  }
}
