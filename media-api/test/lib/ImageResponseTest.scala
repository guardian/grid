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

    val mediaApiCfg = buildMediaAPIConfig
    val noS3Client = null
    val noUsageQuota = null
    val imageResponse = new ImageResponse(mediaApiCfg, noS3Client, noUsageQuota)
    import imageResponse._

    imagePersistenceReasons(img) shouldBe Nil
    val imgWithPersistenceIdentifier = img.copy(identifiers = Map(mediaApiCfg.persistenceIdentifier -> "test-id"))
    imagePersistenceReasons(imgWithPersistenceIdentifier) shouldBe List("persistence-identifier")
    val imgWithExports = img.copy(exports = List(Crop(None, None, None, null, None, Nil)))
    imagePersistenceReasons(imgWithExports) shouldBe List("exports")
    val imgWithUsages = img.copy(usages = List(Usage("test", Nil, null, "img", null, None, None, now())))
    imagePersistenceReasons(imgWithUsages) shouldBe List("usages")
    val imgWitArchive = img.copy(userMetadata = Some(Edits(archived = true, metadata = null)))
    imagePersistenceReasons(imgWitArchive) shouldBe List("archived")
    val imgWitPhotographerCategory = img.copy(usageRights = ContractPhotographer("test"))
    imagePersistenceReasons(imgWitPhotographerCategory) shouldBe List("photographer-category")
    val imgWitIllustratorCategory = img.copy(usageRights = StaffIllustrator("test"))
    imagePersistenceReasons(imgWitIllustratorCategory) shouldBe List("illustrator-category")
    val imgWitAgencyCommissionedCategory = img.copy(usageRights = CommissionedAgency("test"))
    imagePersistenceReasons(imgWitAgencyCommissionedCategory) shouldBe List(CommissionedAgency.category)
    val imgWitLeases = img.copy(leases = LeasesByMedia.build(List(MediaLease(id = None, leasedBy = None, notes = None, mediaId = "test"))))
    imagePersistenceReasons(imgWitLeases) shouldBe List("leases")

    val imgWitPhotoshoot = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata(title = Some("test")), photoshoot = Some(Photoshoot("test")))))
    imagePersistenceReasons(imgWitPhotoshoot) shouldBe List("photoshoot", "edited")

    val imgWitUserEdits = img.copy(userMetadata = Some(Edits(metadata = ImageMetadata(title = Some("test")))))
    imagePersistenceReasons(imgWitUserEdits) shouldBe List("edited")
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
