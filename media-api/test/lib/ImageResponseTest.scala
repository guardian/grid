package lib

import com.gu.mediaservice.model.usage.Usage
import com.gu.mediaservice.model.{CommissionedAgency, ContractPhotographer, Crop, Edits, Image, ImageMetadata, LeasesByMedia, MediaLease, Photoshoot, StaffIllustrator, StaffPhotographer, UsageRights}
import com.typesafe.config.{ConfigFactory, ConfigValue, ConfigValueFactory}
import org.joda.time.DateTime
import org.scalatest.{FunSpec, Matchers}
import play.api.Configuration

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

    ImageResponse.imagePersistenceReasonsFoo(img, persistedRootCollections, persistedIdentifier) shouldBe Nil
    val imgWithPersistenceIdentifier = img.copy(identifiers = Map(persistedIdentifier -> "test-id"))
    ImageResponse.imagePersistenceReasonsFoo(imgWithPersistenceIdentifier, persistedRootCollections, persistedIdentifier) shouldBe List("persistence-identifier")
    val imgWithExports = img.copy(exports = List(Crop(None, None, None, null, None, Nil)))
    ImageResponse.imagePersistenceReasonsFoo(imgWithExports, persistedRootCollections, persistedIdentifier) shouldBe List("exports")
    val imgWithUsages = img.copy(usages = List(Usage("test", Nil, null, "img", null, None, None, now())))
    ImageResponse.imagePersistenceReasonsFoo(imgWithUsages, persistedRootCollections, persistedIdentifier) shouldBe List("usages")
    val imgWitArchive = img.copy(userMetadata = Some(Edits(archived = true, metadata = null)))
    ImageResponse.imagePersistenceReasonsFoo(imgWitArchive, persistedRootCollections, persistedIdentifier) shouldBe List("archived")
    val imgWitPhotographerCategory = img.copy(usageRights = ContractPhotographer("test"))
    ImageResponse.imagePersistenceReasonsFoo(imgWitPhotographerCategory, persistedRootCollections, persistedIdentifier) shouldBe List("photographer-category")
    val imgWitIllustratorCategory = img.copy(usageRights = StaffIllustrator("test"))
    ImageResponse.imagePersistenceReasonsFoo(imgWitIllustratorCategory, persistedRootCollections, persistedIdentifier) shouldBe List("illustrator-category")
    val imgWitAgencyCommissionedCategory = img.copy(usageRights = CommissionedAgency("test"))
    ImageResponse.imagePersistenceReasonsFoo(imgWitAgencyCommissionedCategory, persistedRootCollections, persistedIdentifier) shouldBe List(CommissionedAgency.category)
    val imgWitLeases = img.copy(leases = LeasesByMedia.build(List(MediaLease(id = None, leasedBy = None, notes = None, mediaId = "test"))))
    ImageResponse.imagePersistenceReasonsFoo(imgWitLeases, persistedRootCollections, persistedIdentifier) shouldBe List("leases")

    val imgWitPhotoshoot = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata(title = Some("test")), photoshoot = Some(Photoshoot("test")))))
    ImageResponse.imagePersistenceReasonsFoo(imgWitPhotoshoot, persistedRootCollections, persistedIdentifier) shouldBe List("photoshoot", "edited")

    val imgWitUserEdits = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata(title = Some("test")))))
    ImageResponse.imagePersistenceReasonsFoo(imgWitUserEdits, persistedRootCollections, persistedIdentifier) shouldBe List("edited")
  }

  private def buildMediaAPIConfig = {
    import scala.collection.JavaConverters._

    val configs = Map[String, ConfigValue](
      "persistence.identifier" -> ConfigValueFactory.fromAnyRef("test-p-id")
    )
    val typeSafeCfg = ConfigFactory.parseMap(configs.asJava)
    new MediaApiConfig(new Configuration(typeSafeCfg))
  }
}
