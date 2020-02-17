package com.gu.mediaservice

import java.net.URI
import java.util.UUID

import com.gu.mediaservice.model.leases.LeasesByMedia
import com.gu.mediaservice.model.usage.Usage
import com.gu.mediaservice.model._
import org.joda.time.DateTime
import org.scalatest.{FlatSpec, Matchers}

class ImageMetadataOverridesTest extends FlatSpec with Matchers {

  it should "override image metadata with user edits" in {
    val image = createImage()
    image.metadata shouldEqual ImageMetadata(dateTaken = None, title = Some(s"test title"), keywords = List())
    image.usageRights shouldEqual StaffPhotographer("T. Hanks", "The Guardian")

    val actual = ImageMetadataOverrides.overrideMetadata(image)

    actual.metadata shouldEqual ImageMetadata(dateTaken = None, title = Some(s"test title edits"), description = Some("test description edits"), keywords = List())
    actual.usageRights shouldEqual StaffPhotographer("photographer after edits", "publication after edits")
  }

  private def createImage(id: String = UUID.randomUUID().toString, usages: List[Usage] = List(), leases: Option[LeasesByMedia] = None, syndicationRights: Option[SyndicationRights] = None): Image = {
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
        mimeType = Some("image/jpeg"),
        dimensions = Some(Dimensions(width = 1, height = 1)),
        secureUrl = None
      ),
      thumbnail = None,
      optimisedPng = None,
      fileMetadata = FileMetadata(),
      userMetadata = Some(
        Edits(
          metadata = ImageMetadata(dateTaken = None, title = Some(s"test title edits"), description = Some("test description edits"), keywords = List()),
          usageRights = Some(StaffPhotographer("photographer after edits", "publication after edits"))
        )
      ),
      metadata = ImageMetadata(dateTaken = None, title = Some(s"test title"), keywords = List()),
      originalMetadata = ImageMetadata(),
      usageRights = StaffPhotographer("T. Hanks", "The Guardian"),
      originalUsageRights = StaffPhotographer("T. Hanks", "The Guardian"),
      exports = Nil,

      syndicationRights = syndicationRights,
      usages = usages,
      leases = leases.getOrElse(LeasesByMedia.build(Nil))
    )
  }

}
