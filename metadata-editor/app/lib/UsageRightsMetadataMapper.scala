package lib

import com.gu.mediaservice.model._

object UsageRightsMetadataMapper {

  def usageRightsToMetadata(usageRights: UsageRights): Option[ImageMetadata] = {
    val toImageMetadata: PartialFunction[UsageRights, ImageMetadata] = (ur: UsageRights) => ur match {
      case u: StaffPhotographer        => ImageMetadata(byline = Some(u.photographer), credit = Some(u.publication))
      case u: ContractPhotographer     => ImageMetadata(byline = Some(u.photographer), credit = u.publication)
      case u: CommissionedPhotographer => ImageMetadata(byline = Some(u.photographer), credit = u.publication)
      case u: ContractIllustrator      => ImageMetadata(credit = Some(u.creator))
      case u: CommissionedIllustrator  => ImageMetadata(credit = Some(u.creator))
      case u: Composite                => ImageMetadata(credit = Some(u.suppliers))
    }

    // if we don't match, return None
    toImageMetadata.lift(usageRights)
  }
}
