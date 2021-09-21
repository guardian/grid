package lib

import com.gu.mediaservice.model._
import org.scalatest.{FunSpec, Matchers}

class UsageRightsMetadataMapperTest extends FunSpec with Matchers {

  import UsageRightsMetadataMapper.usageRightsToMetadata

  describe("UsageRights => ImageMetadata") {
    val metadataWithoutCopyright = ImageMetadata(copyright = None)
    val metadataWithCopyright = ImageMetadata(copyright = Some("BBC"))

    it ("should convert StaffPhotographers") {
      val ur = StaffPhotographer("Alicia Canter", "The Guardian")
      usageRightsToMetadata(ur, metadataWithCopyright) should be
        Some(ImageMetadata(credit = Some("The Guardian"), byline = Some("Alicia Canter"), copyright = Some("BBC")))
    }

    it ("should convert ContractPhotographers") {
      val ur = StaffPhotographer("Andy Hall", "The Observer")
      usageRightsToMetadata(ur, metadataWithCopyright) should be
        Some(ImageMetadata(credit = Some("The Observer"), byline = Some("Andy Hall"), copyright = metadataWithCopyright.copyright))
    }

    it("should add copyright to StaffPhotographers when original metadata doesn't have it") {
      val ur = StaffPhotographer("Alicia Canter", "The Guardian")
      usageRightsToMetadata(ur, metadataWithoutCopyright) should be
      Some(ImageMetadata(credit = Some("The Guardian"), byline = Some("Alicia Canter"), copyright = Some("The Guardian")))
    }


    it ("should convert CommissionedPhotographers") {
      val ur = CommissionedPhotographer("Mr. Photo", Some("Weekend Magazine"))
      usageRightsToMetadata(ur, metadataWithoutCopyright) should be
        Some(ImageMetadata(credit = Some("Weekend Magazine"), byline = Some("Mr. Photo")))
    }

    it ("should convert ContractIllustrators") {
      val ur = ContractIllustrator("First Dog on the Moon Institute")
      usageRightsToMetadata(ur, metadataWithoutCopyright) should be
        Some(ImageMetadata(credit = Some("First Dog on the Moon Institute")))
    }

    it ("should convert CommissionedIllustrators") {
      val ur = CommissionedIllustrator("Roger Rabbit")
      usageRightsToMetadata(ur, metadataWithoutCopyright) should be
        Some(ImageMetadata(credit = Some("Roger Rabit")))
    }

    it ("should convert Composites") {
      val ur = Composite("REX/Getty Images")
      usageRightsToMetadata(ur, metadataWithoutCopyright) should be
        Some(ImageMetadata(credit = Some("REX/Getty Images")))
    }

    it ("should convert Screengrabs") {
      val ur = Screengrab(Some("BBC News"))
      usageRightsToMetadata(ur, metadataWithoutCopyright) should be
        Some(ImageMetadata(credit = Some("BBC News")))
    }

    it ("should not convert Agencies") {
      val ur = Agency("Rex Features")
      usageRightsToMetadata(ur, metadataWithoutCopyright) should be(None)
    }

  }
}
