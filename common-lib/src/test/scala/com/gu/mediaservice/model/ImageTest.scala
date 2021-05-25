package com.gu.mediaservice.model

import com.gu.mediaservice.model.ImageTest._

import java.net.URI
import java.util.UUID
import com.gu.mediaservice.model.leases.{AllowSyndicationLease, DenySyndicationLease, LeasesByMedia, MediaLease}
import com.gu.mediaservice.model.usage._
import org.joda.time.DateTime
import org.scalatest.{FunSpec, Matchers}

class ImageTest extends FunSpec with Matchers {

  describe("Image syndication status") {
    it("should be UnsuitableForSyndication by default") {
      val image = createImage()

      image.usages.length shouldBe 0
      image.syndicationRights shouldBe None
      image.leases.leases.length shouldBe 0

      image.syndicationStatus shouldBe UnsuitableForSyndication
    }

    it("should be AwaitingReviewForSyndication if syndication rights are acquired") {
      val image = createImage(
        syndicationRights = Some(rightsAcquired)
      )

      image.syndicationStatus shouldBe AwaitingReviewForSyndication
    }

    it("should be UnsuitableForSyndication if syndication rights are not acquired") {
      val image = createImage(
        syndicationRights = Some(noRightsAcquired)
      )

      image.syndicationStatus shouldBe UnsuitableForSyndication
    }

    it("should be UnsuitableForSyndication if there is no syndication rights") {
      val imageId = UUID.randomUUID().toString

      val usages = List(
        syndicationUsage,
        digitalUsage
      )

      val leaseByMedia = LeasesByMedia.build(
        leases = List(MediaLease(
          id = None,
          leasedBy = None,
          access = AllowSyndicationLease,
          notes = None,
          mediaId = imageId
        ))
      )

      val image = createImage(
        id = imageId,
        usages = usages,
        leases = Some(leaseByMedia)
      )

      image.syndicationStatus shouldBe UnsuitableForSyndication
    }

    it("should be SentForSyndication if there is a syndication usage") {
      val usages = List(
        syndicationUsage,
        digitalUsage
      )

      val image = createImage(
        syndicationRights = Some(rightsAcquired),
        usages = usages
      )

      image.syndicationStatus shouldBe SentForSyndication
    }
  }

  it("should be QueuedForSyndication if there is an allow syndication lease and no syndication usage") {
    val imageId = UUID.randomUUID().toString

    val leaseByMedia = LeasesByMedia.build(leases = List(MediaLease(
      id = None,
      leasedBy = None,
      access = AllowSyndicationLease,
      notes = None,
      mediaId = imageId
    )))

    val usages = List(
      digitalUsage
    )

    val image = createImage(
      id = imageId,
      syndicationRights = Some(rightsAcquired),
      usages = usages,
      leases = Some(leaseByMedia)
    )

    image.syndicationStatus shouldBe QueuedForSyndication
  }

  it("should be BlockedForSyndication if there is a deny syndication lease and no syndication usage") {
    val imageId = UUID.randomUUID().toString

    val leaseByMedia = LeasesByMedia.build(
      leases = List(MediaLease(
        id = None,
        leasedBy = None,
        access = DenySyndicationLease,
        notes = None,
        mediaId = imageId
      ))
    )

    val usages = List(
      digitalUsage
    )

    val image = createImage(
      id = imageId,
      syndicationRights = Some(rightsAcquired),
      usages = usages,
      leases = Some(leaseByMedia)
    )

    image.syndicationStatus shouldBe BlockedForSyndication
  }
}

object ImageTest {
  def createImage(id: String = UUID.randomUUID().toString, usages: List[Usage] = List(), leases: Option[LeasesByMedia] = None, syndicationRights: Option[SyndicationRights] = None): Image = {
    Image(
      id = id,
      uploadTime = DateTime.now(),
      uploadedBy = "test.user@theguardian.com",
      lastModified = None,
      identifiers = Map.empty,
      uploadInfo = UploadInfo(filename = Some(s"test_$id.jpeg")),
      source = Asset(
        file = new URI(s"https://file/$id"),
        size = Some(1L),
        mimeType = Some(Jpeg),
        dimensions = Some(Dimensions(width = 1, height = 1)),
        secureUrl = None
      ),
      thumbnail = None,
      optimisedPng = None,
      fileMetadata = FileMetadata(),
      userMetadata = None,
      metadata = ImageMetadata(dateTaken = None, title = Some(s"Test image $id"), keywords = List()),
      originalMetadata = ImageMetadata(),
      usageRights = StaffPhotographer("T. Hanks", "The Guardian"),
      originalUsageRights = StaffPhotographer("T. Hanks", "The Guardian"),
      exports = Nil,

      syndicationRights = syndicationRights,
      usages = usages,
      leases = leases.getOrElse(LeasesByMedia.build(Nil))
    )
  }

  val syndicationUsage = Usage(
    UUID.randomUUID().toString,
    List(UsageReference(SyndicationUsageReference)),
    SyndicationUsage,
    "image",
    SyndicatedUsageStatus,
    Some(DateTime.now()),
    None,
    DateTime.now()
  )

  val digitalUsage = Usage(
    UUID.randomUUID().toString,
    List(UsageReference(ComposerUsageReference)),
    DigitalUsage,
    "image",
    PublishedUsageStatus,
    Some(DateTime.now()),
    None,
    DateTime.now()
  )

  val rightsAcquired = SyndicationRights(None, Nil, List(Right("rights-code", Some(true), Nil)))
  val noRightsAcquired = SyndicationRights(None, Nil, List(Right("rights-code", Some(false), Nil)))

}
