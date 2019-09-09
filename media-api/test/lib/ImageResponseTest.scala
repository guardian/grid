package lib

import com.gu.mediaservice.model.usage.Usage
import com.gu.mediaservice.model.{CommissionedAgency, ContractPhotographer, Crop, Edits, Image, ImageMetadata, LeasesByMedia, MediaLease, Photoshoot, StaffIllustrator, StaffPhotographer, UsageRights}
import org.joda.time.DateTime
import org.scalatest.{FunSpec, Matchers}

class ImageResponseTest extends FunSpec with Matchers {
  it("should replace \\r linebreaks with \\n") {
    val text = "Here is some text\rthat spans across\rmultiple lines\r"
    val normalisedText = ImageResponse.normaliseNewLines(text)
    normalisedText shouldBe "Here is some text\nthat spans across\nmultiple lines\n"
  }

  it("should replace \\r\\n linebreaks with \\n") {
    val text = "Here is some text\r\nthat spans across\r\nmultiple lines\r\n"
    val normalisedText = ImageResponse.normaliseNewLines(text)
    normalisedText shouldBe "Here is some text\nthat spans across\nmultiple lines\n"
  }

  it("should not touch \\n linebreaks") {
    val text = "Here is some text\nthat spans across\nmultiple lines\n"
    val normalisedText = ImageResponse.normaliseNewLines(text)
    normalisedText shouldBe "Here is some text\nthat spans across\nmultiple lines\n"
  }

  it("should generate image persistence reasons") {
    import DateTime.now
    val img = Image(
      id = "test-id",
      uploadTime = now(),
      uploadedBy = "user",
      lastModified = None,
      identifiers = Map.empty,
      uploadInfo = null,
      source = null,
      thumbnail = None,
      optimisedPng = None,
      fileMetadata = null,
      userMetadata = None,
      metadata = null,
      originalMetadata = null,
      usageRights = null,
      originalUsageRights = null
    )

    val persistedIdentifier = "test-p-id"
    val persistedRootCollections = List()
    val getImagePersistenceReasonsFunction =  ImageResponse.imagePersistenceReasonsFunction(persistedRootCollections, persistedIdentifier)

    getImagePersistenceReasonsFunction(img) shouldBe Nil
    val imgWithPersistenceIdentifier = img.copy(identifiers = Map(persistedIdentifier -> "test-id"))
    getImagePersistenceReasonsFunction(imgWithPersistenceIdentifier) shouldBe List("persistence-identifier")
    val imgWithExports = img.copy(exports = List(Crop(None, None, None, null, None, Nil)))
    getImagePersistenceReasonsFunction(imgWithExports) shouldBe List("exports")
    val imgWithUsages = img.copy(usages = List(Usage("test", Nil, null, "img", null, None, None, now())))
    getImagePersistenceReasonsFunction(imgWithUsages) shouldBe List("usages")
    val imgWitArchive = img.copy(userMetadata = Some(Edits(archived = true, metadata = null)))
    getImagePersistenceReasonsFunction(imgWitArchive) shouldBe List("archived")
    val imgWitPhotographerCategory = img.copy(usageRights = ContractPhotographer("test"))
    getImagePersistenceReasonsFunction(imgWitPhotographerCategory) shouldBe List("photographer-category")
    val imgWitIllustratorCategory = img.copy(usageRights = StaffIllustrator("test"))
    getImagePersistenceReasonsFunction(imgWitIllustratorCategory) shouldBe List("illustrator-category")
    val imgWitAgencyCommissionedCategory = img.copy(usageRights = CommissionedAgency("test"))
    getImagePersistenceReasonsFunction(imgWitAgencyCommissionedCategory) shouldBe List(CommissionedAgency.category)
    val imgWitLeases = img.copy(leases = LeasesByMedia.build(List(MediaLease(id = None, leasedBy = None, notes = None, mediaId = "test"))))
    getImagePersistenceReasonsFunction(imgWitLeases) shouldBe List("leases")

    val imgWitPhotoshoot = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata(title = Some("test")), photoshoot = Some(Photoshoot("test")))))
    getImagePersistenceReasonsFunction(imgWitPhotoshoot) shouldBe List("photoshoot", "edited")

    val imgWitUserEdits = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata(title = Some("test")))))
    getImagePersistenceReasonsFunction(imgWitUserEdits) shouldBe List("edited")
  }
}
