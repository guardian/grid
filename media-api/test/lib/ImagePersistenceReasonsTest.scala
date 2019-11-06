package lib

import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.{LeasesByMedia, MediaLease}
import com.gu.mediaservice.model.usage.Usage
import org.joda.time.DateTime.now
import org.scalatest.{FunSpec, Matchers}

class ImagePersistenceReasonsTest extends FunSpec with Matchers {

  it("should generate image persistence reasons") {

    import TestUtils._

    val persistedIdentifier = "test-p-id"
    val persistedRootCollections = List("coll1", "coll2", "coll3")
    val imgPersistenceReasons = ImagePersistenceReasons.apply(persistedRootCollections, persistedIdentifier)

    imgPersistenceReasons.getImagePersistenceReasons(img) shouldBe Nil
    val imgWithPersistenceIdentifier = img.copy(identifiers = Map(persistedIdentifier -> "test-id"))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithPersistenceIdentifier) shouldBe List("persistence-identifier")
    val imgWithExports = img.copy(exports = List(Crop(None, None, None, null, None, Nil)))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithExports) shouldBe List("exports")
    val imgWithUsages = img.copy(usages = List(Usage("test", Nil, null, "img", null, None, None, now())))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithUsages) shouldBe List("usages")
    val imgWithArchive = img.copy(userMetadata = Some(Edits(archived = true, metadata = ImageMetadata.empty)))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithArchive) shouldBe List("archived")
    val imgWithPhotographerCategory = img.copy(usageRights = ContractPhotographer("test"))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithPhotographerCategory) shouldBe List("photographer-category")
    val imgWithIllustratorCategory = img.copy(usageRights = StaffIllustrator("test"))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithIllustratorCategory) shouldBe List("illustrator-category")
    val imgWithAgencyCommissionedCategory = img.copy(usageRights = CommissionedAgency("test"))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithAgencyCommissionedCategory) shouldBe List(CommissionedAgency.category)
    val imgWithLeases = img.copy(leases = LeasesByMedia.build(List(MediaLease(id = None, leasedBy = None, notes = None, mediaId = "test"))))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithLeases) shouldBe List("leases")
    val imgWithPersistedRootCollections = img.copy(collections = List(Collection.build(persistedRootCollections.tail, ActionData("testAuthor", now()))))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithPersistedRootCollections) shouldBe List("persisted-collection")

    val imgWithPhotoshoot = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata.empty, photoshoot = Some(Photoshoot("test")))))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithPhotoshoot) shouldBe List("photoshoot")

    val imgWithUserEdits = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata(title = Some("test")))))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithUserEdits) shouldBe List("edited")

    val imgWithLabels = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata.empty, labels = List("test-label"))))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithLabels) shouldBe List("labeled")

    val imgWithMultipleReasons = img.copy(userMetadata = Some(Edits(
      labels = List("test-label"),
      metadata = ImageMetadata(title = Some("test")),
      photoshoot = Some(Photoshoot("test")))))
    imgPersistenceReasons.getImagePersistenceReasons(imgWithMultipleReasons) should contain theSameElementsAs List("labeled", "edited", "photoshoot")
  }

}
