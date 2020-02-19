package com.gu.mediaservice

import java.net.URI
import java.util.UUID

import com.gu.mediaservice.model.leases.LeasesByMedia
import com.gu.mediaservice.model.usage.Usage
import com.gu.mediaservice.model._
import org.joda.time.DateTime
import org.scalatest.{FlatSpec, Matchers}

class ImageProjectionOverridesTest extends FlatSpec with Matchers {

  private val Deletion = Some("")

  private val initialImgMetadata = ImageMetadata(
    dateTaken = Some(new DateTime("2014-01-01T00:00:00.000Z")),
    title = Some("test title"),
    credit = Some("test credit"),
    keywords = List("a", "b", "c")
  )

  private val imgMetadataEdits = ImageMetadata(
    title = Some(s"test title edits"),
    description = Some("test description edits"),
    credit = Deletion
  )

  private val initialUsageRights = StaffPhotographer("T. Hanks", "The Guardian")

  private val editedUsageRights = StaffPhotographer("photographer after edits", "publication after edits")

  it should "override image metadata with user edits" in {
    val image = createImage()
    image.metadata shouldEqual initialImgMetadata
    image.usageRights shouldEqual initialUsageRights

    val actual = ImageProjectionOverrides.overrideSelectedFields(image)

    val metadataExpected = ImageMetadata(
      dateTaken = Some(new DateTime("2014-01-01T00:00:00.000Z")),
      title = Some(s"test title edits"),
      description = Some("test description edits"),
      credit = None,
      keywords = List("a", "b", "c")
    )

    actual.metadata shouldEqual metadataExpected
    actual.usageRights shouldEqual editedUsageRights
  }

  it should "override image metadata with the latest lastModified picked form sub fields" in {
    import ImageProjectionOverrides.overrideSelectedFields
    val date = new DateTime("2014-01-01T00:00:00.000Z")

    val imageWithNoDates = createImage()
    overrideSelectedFields(imageWithNoDates).lastModified shouldEqual None

    val imageWithMainLastModOnly = createImage().copy(lastModified = Some(date))
    overrideSelectedFields(imageWithMainLastModOnly).lastModified.get shouldEqual date

    val imageWithCrops = createImage().copy(
      lastModified = Some(date),
      exports = List(
        Crop(
          id = None,
          author = None,
          date = Some(date.plusHours(1)),
          specification = null,
          master = None,
          assets = Nil
        )
      ),
    )

    overrideSelectedFields(imageWithCrops).lastModified.get shouldEqual date.plusHours(1)

    val imageWithAllDates = createImage().copy(
      lastModified = Some(date),
      leases = LeasesByMedia.empty.copy(lastModified = Some(date.plusHours(1))),
      exports = List(Crop(
          id = None,
          author = None,
          date = Some(date.plusHours(2)),
          specification = null,
          master = None,
          assets = Nil)),
      collections = List(Collection(
        path = Nil,
        description = "",
        actionData = ActionData(author = "", date = date.plusHours(3))
      )),
      usages = List(Usage(
        id = "", references = Nil, platform = null, media = "", status = null,
        dateAdded = None, dateRemoved = None, lastModified = date.plusHours(4)
      ))
    )

    overrideSelectedFields(imageWithAllDates).lastModified.get shouldEqual date.plusHours(4)
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
          metadata = imgMetadataEdits,
          usageRights = Some(StaffPhotographer("photographer after edits", "publication after edits"))
        )
      ),
      metadata = initialImgMetadata,
      originalMetadata = ImageMetadata(),
      usageRights = initialUsageRights,
      originalUsageRights = StaffPhotographer("T. Hanks", "The Guardian"),
      exports = Nil,

      syndicationRights = syndicationRights,
      usages = usages,
      leases = leases.getOrElse(LeasesByMedia.build(Nil))
    )
  }

}
