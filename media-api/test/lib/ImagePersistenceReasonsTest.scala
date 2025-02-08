package lib

import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.{LeasesByMedia, MediaLease}
import com.gu.mediaservice.model.usage.Usage
import org.joda.time.DateTime.now
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class ImagePersistenceReasonsTest extends AnyFunSpec with Matchers {

  it("should generate image persistence reasons") {

    import TestUtils._

    val persistedIdentifier = "test-p-id"
    val persistedCollections = Set("coll1", "coll2", "coll3")
    val imgPersistenceReasons = ImagePersistenceReasons(Some(persistedCollections))
    val imagePersistenceReasonsWithEmptyListOfPersistedCollections = ImagePersistenceReasons(Some(Set.empty))

    imgPersistenceReasons.reasons(img) shouldBe Nil
    val imgWithExports = img.copy(exports = List(Crop(None, None, None, null, None, Nil)))
    imgPersistenceReasons.reasons(imgWithExports) shouldBe List("exports")
    val imgWithUsages = img.copy(usages = List(Usage("test", Nil, null, "img", null, None, None, now())))
    imgPersistenceReasons.reasons(imgWithUsages) shouldBe List("usages")
    val imgWithArchive = img.copy(userMetadata = Some(Edits(archived = true, metadata = ImageMetadata.empty)))
    imgPersistenceReasons.reasons(imgWithArchive) shouldBe List("archived")
    val imgWithPhotographerCategory = img.copy(usageRights = ContractPhotographer("test"))
    imgPersistenceReasons.reasons(imgWithPhotographerCategory) shouldBe List("photographer-category")
    val imgWithIllustratorCategory = img.copy(usageRights = StaffIllustrator("test"))
    imgPersistenceReasons.reasons(imgWithIllustratorCategory) shouldBe List("illustrator-category")
    val imgWithAgencyCommissionedCategory = img.copy(usageRights = CommissionedAgency("test"))
    imgPersistenceReasons.reasons(imgWithAgencyCommissionedCategory) shouldBe List(CommissionedAgency.category)
    val imgWithLeases = img.copy(leases = LeasesByMedia.build(List(MediaLease(id = None, leasedBy = None, notes = None, mediaId = "test"))))
    imgPersistenceReasons.reasons(imgWithLeases) shouldBe List("leases")
    val imgInPersistedCollection = img.copy(collections = List(Collection.build(persistedCollections.headOption.toList, ActionData("testAuthor", now()))))
    imgPersistenceReasons.reasons(imgInPersistedCollection) shouldBe List("persisted-collection")
    imagePersistenceReasonsWithEmptyListOfPersistedCollections.reasons(imgInPersistedCollection) shouldBe List()

    val imgWithPhotoshoot = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata.empty, photoshoot = Some(Photoshoot("test")))))
    imgPersistenceReasons.reasons(imgWithPhotoshoot) shouldBe List("photoshoot")

    val imgWithUserEdits = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata(title = Some("test")))))
    imgPersistenceReasons.reasons(imgWithUserEdits) shouldBe List("edited")

    val imgWithLabels = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata.empty, labels = List("test-label"))))
    imgPersistenceReasons.reasons(imgWithLabels) shouldBe List("labeled")

    val imgWithMultipleReasons = img.copy(userMetadata = Some(Edits(
      labels = List("test-label"),
      metadata = ImageMetadata(title = Some("test")),
      photoshoot = Some(Photoshoot("test")))))
    imgPersistenceReasons.reasons(imgWithMultipleReasons) should contain theSameElementsAs List("labeled", "edited", "photoshoot")
  }

}
