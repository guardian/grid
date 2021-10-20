package com.gu.mediaservice.lib.metadata

import com.gu.mediaservice.model._

object UsageRightsMetadataMapper {

  def usageRightsToMetadata(usageRights: UsageRights, originalMetadata: ImageMetadata, staffPhotographerPublications: Set[String] = Set()): Option[ImageMetadata] = {
    val toImageMetadata: PartialFunction[UsageRights, ImageMetadata] = (ur: UsageRights) => ur match {
      case u: StaffPhotographer        =>
        val copyright: Option[String] = originalMetadata.copyright match {
          case None => Some(u.publication)
          case Some(originalCopyright) =>
            if (staffPhotographerPublications.contains(originalCopyright))
              Some(u.publication)
            else
              Some(originalCopyright)
        }
        ImageMetadata(
          byline = Some(u.photographer),
          credit = Some(u.publication),
          copyright = copyright
        )
      case u: ContractPhotographer     => ImageMetadata(byline = Some(u.photographer), credit = u.publication)
      case u: CommissionedPhotographer => ImageMetadata(byline = Some(u.photographer), credit = u.publication)
      case u: ContractIllustrator      => ImageMetadata(byline = Some(u.creator),      credit = u.publication)
      case u: StaffIllustrator         => ImageMetadata(byline = Some(u.creator),      credit = Some(u.creator))
      case u: CommissionedIllustrator  => ImageMetadata(byline = Some(u.creator),      credit = u.publication)
      case u: Composite                => ImageMetadata(credit = Some(u.suppliers))
      case u: Screengrab               => ImageMetadata(credit = u.source)
    }

    // if we don't match, return None
    toImageMetadata.lift(usageRights)
  }
}
