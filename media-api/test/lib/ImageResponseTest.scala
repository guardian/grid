package lib

import com.gu.mediaservice.model.usage.{PendingUsageStatus, PrintUsage, Usage, UsageType}
import com.gu.mediaservice.model.{ActionData, Bounds, Collection, CommissionedAgency, ContractPhotographer, Crop, CropSpec, Edits, Image, ImageMetadata, LeasesByMedia, MediaLease, Photoshoot, StaffIllustrator, StaffPhotographer, UsageRights}
import org.joda.time.DateTime.now
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

  private val img = Image(
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

  it("should generate image persistence reasons") {
    val persistedIdentifier = "test-p-id"
    val persistedRootCollections = List("coll1", "coll2", "coll3")
    val getImagePersistenceReasonsFunction = ImageResponse.imagePersistenceReasonsFunction(persistedRootCollections, persistedIdentifier)

    getImagePersistenceReasonsFunction(img) shouldBe Nil
    val imgWithPersistenceIdentifier = img.copy(identifiers = Map(persistedIdentifier -> "test-id"))
    getImagePersistenceReasonsFunction(imgWithPersistenceIdentifier) shouldBe List("persistence-identifier")
    val imgWithExports = img.copy(exports = List(Crop(None, None, None, null, None, Nil)))
    getImagePersistenceReasonsFunction(imgWithExports) shouldBe List("exports")
    val imgWithUsages = img.copy(usages = List(Usage("test", Nil, null, "img", null, None, None, now())))
    getImagePersistenceReasonsFunction(imgWithUsages) shouldBe List("usages")
    val imgWitArchive = img.copy(userMetadata = Some(Edits(archived = true, metadata = ImageMetadata.empty)))
    getImagePersistenceReasonsFunction(imgWitArchive) shouldBe List("archived")
    val imgWitPhotographerCategory = img.copy(usageRights = ContractPhotographer("test"))
    getImagePersistenceReasonsFunction(imgWitPhotographerCategory) shouldBe List("photographer-category")
    val imgWitIllustratorCategory = img.copy(usageRights = StaffIllustrator("test"))
    getImagePersistenceReasonsFunction(imgWitIllustratorCategory) shouldBe List("illustrator-category")
    val imgWitAgencyCommissionedCategory = img.copy(usageRights = CommissionedAgency("test"))
    getImagePersistenceReasonsFunction(imgWitAgencyCommissionedCategory) shouldBe List(CommissionedAgency.category)
    val imgWitLeases = img.copy(leases = LeasesByMedia.build(List(MediaLease(id = None, leasedBy = None, notes = None, mediaId = "test"))))
    getImagePersistenceReasonsFunction(imgWitLeases) shouldBe List("leases")
    val imgWitPersistedRootCollections = img.copy(collections = List(Collection.build(persistedRootCollections.tail, ActionData("testAuthor", now()))))
    getImagePersistenceReasonsFunction(imgWitPersistedRootCollections) shouldBe List("persisted-collection")

    val imgWitPhotoshoot = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata.empty, photoshoot = Some(Photoshoot("test")))))
    getImagePersistenceReasonsFunction(imgWitPhotoshoot) shouldBe List("photoshoot")

    val imgWitUserEdits = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata(title = Some("test")))))
    getImagePersistenceReasonsFunction(imgWitUserEdits) shouldBe List("edited")

    val imgWithLabels = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata.empty, labels = List("test-label"))))
    getImagePersistenceReasonsFunction(imgWithLabels) shouldBe List("labeled")

    val imgWithMultipleReasons = img.copy(userMetadata = Some(Edits(
      labels = List("test-label"),
      metadata = ImageMetadata(title = Some("test")),
      photoshoot = Some(Photoshoot("test")))))
    getImagePersistenceReasonsFunction(imgWithMultipleReasons) should contain theSameElementsAs  List("labeled", "edited", "photoshoot")
  }

  it("should indicate if image can be deleted" +
    "(it can be deleted if there is no exports or usages)") {
    val testCrop = Crop(Some("crop-id"), None, None, CropSpec("test-uri", Bounds(0, 0, 0, 0), None), None, Nil)
    val testUsage = Usage(id = "usage-id", references = Nil, platform = PrintUsage, media = "test", status = PendingUsageStatus, dateAdded = None, dateRemoved = None, now())

    val imgWithNoExportsAndUsages = img
    import ImageResponse.canImgBeDeleted
    canImgBeDeleted(imgWithNoExportsAndUsages) shouldEqual true
    val imgWithExportsAndUsages = img.copy(exports = List(testCrop)).copy(usages = List(testUsage))
    canImgBeDeleted(imgWithExportsAndUsages) shouldEqual false
    val imgWithOnlyUsages = img.copy(usages = List(testUsage))
    canImgBeDeleted(imgWithOnlyUsages) shouldEqual false
    val imgWithOnlyExports = img.copy(exports = List(testCrop))
    canImgBeDeleted(imgWithOnlyExports) shouldEqual false
  }
}
