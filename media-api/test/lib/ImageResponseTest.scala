package lib

import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage.{PendingUsageStatus, PrintUsage, Usage}
import lib.elasticsearch.{Fixtures, SourceWrapper}
import org.joda.time.DateTime.now
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json._

class ImageResponseTest extends AnyFunSpec with Matchers with Fixtures {

  val mediaApiConfig: MediaApiConfig = buildMediaApiConfig(Map(
    "field.aliases" -> List(
      Map(
        "elasticsearchPath" -> "fileMetadata.xmp.org:ProgrammeMaker",
        "alias" -> "orgProgrammeMaker",
        "label" -> "Organization Programme Maker",
        "displaySearchHint" -> false
      ),
      Map(
        "elasticsearchPath" -> "fileMetadata.xmp.aux:Lens",
        "alias" -> "auxLens",
        "label" -> "Aux Lens",
        "displaySearchHint" -> false
      ),
      Map(
        "elasticsearchPath" -> "fileMetadata.iptc.Caption Writer/Editor",
        "alias" -> "captionWriter",
        "label" -> "Caption Writer / Editor",
        "displaySearchHint" -> true
      ),
      Map(
        "elasticsearchPath" -> "fileMetadata.c2pa.isAvailable",
        "alias" -> "c2paMetadataAvailable",
        "label" -> "C2PA Metadata Available",
        "displaySearchHint" -> true,
        "matchViaExistence" -> true
      )
    )
  ))

  describe("updateUsageRights (legacy category mapping)") {
    it("should map a legacy category onto its composite replacement when that replacement is in config.applicableUsageRights") {
      PayToUse.allCategories.list.toList should contain(Chargeable.category)

      val imageResponse = new ImageResponse(
        mediaApiConfigWithApplicableUsageRights(List("com.gu.mediaservice.model.PayToUse")),
        null, null
      )
      val source = Json.obj("usageRights" -> Json.obj("category" -> Chargeable.category))
      val result = source.transform(imageResponse.updateUsageRights(source)).get

      (result \ "usageRights" \ "category").as[String] shouldBe PayToUse.category
      (result \ "usageRights" \ "legacyCategory").as[String] shouldBe Chargeable.category
    }

    it("should leave a legacy category untouched when its composite replacement is not in config.applicableUsageRights") {
      val imageResponse = new ImageResponse(
        mediaApiConfigWithApplicableUsageRights(List("com.gu.mediaservice.model.Chargeable")),
        null, null
      )
      val source = Json.obj("usageRights" -> Json.obj("category" -> Chargeable.category))
      val result = source.transform(imageResponse.updateUsageRights(source)).get

      (result \ "usageRights" \ "category").as[String] shouldBe Chargeable.category
      (result \ "usageRights" \ "legacyCategory").toOption shouldBe None
    }

    it("should map a legacy category's supplier field onto source when replaced by PRAndThirdParty") {
      PRAndThirdParty.legacyCategories should contain(CommissionedAgency.category)

      val imageResponse = new ImageResponse(
        mediaApiConfigWithApplicableUsageRights(List("com.gu.mediaservice.model.PRAndThirdParty")),
        null, null
      )
      val source = Json.obj("usageRights" -> Json.obj("category" -> CommissionedAgency.category, "supplier" -> "Corbis"))
      val result = source.transform(imageResponse.updateUsageRights(source)).get

      (result \ "usageRights" \ "category").as[String] shouldBe PRAndThirdParty.category
      (result \ "usageRights" \ "legacyCategory").as[String] shouldBe CommissionedAgency.category
      (result \ "usageRights" \ "source").as[String] shouldBe "Corbis"
    }

    it("should map a legacy category's suppliers field onto source when replaced by PRAndThirdParty") {
      PRAndThirdParty.legacyCategories should contain(Composite.category)

      val imageResponse = new ImageResponse(
        mediaApiConfigWithApplicableUsageRights(List("com.gu.mediaservice.model.PRAndThirdParty")),
        null, null
      )
      val source = Json.obj("usageRights" -> Json.obj("category" -> Composite.category, "suppliers" -> "REX/Getty Images"))
      val result = source.transform(imageResponse.updateUsageRights(source)).get

      (result \ "usageRights" \ "category").as[String] shouldBe PRAndThirdParty.category
      (result \ "usageRights" \ "legacyCategory").as[String] shouldBe Composite.category
      (result \ "usageRights" \ "source").as[String] shouldBe "REX/Getty Images"
    }

    it("should pass a legacy category's own source field through untouched when replaced by PRAndThirdParty") {
      PRAndThirdParty.legacyCategories should contain(Screengrab.category)

      val imageResponse = new ImageResponse(
        mediaApiConfigWithApplicableUsageRights(List("com.gu.mediaservice.model.PRAndThirdParty")),
        null, null
      )
      val source = Json.obj("usageRights" -> Json.obj("category" -> Screengrab.category, "source" -> "BBC News"))
      val result = source.transform(imageResponse.updateUsageRights(source)).get

      (result \ "usageRights" \ "category").as[String] shouldBe PRAndThirdParty.category
      (result \ "usageRights" \ "legacyCategory").as[String] shouldBe Screengrab.category
      (result \ "usageRights" \ "source").as[String] shouldBe "BBC News"
    }
  }

  it("should replace \\r linebreaks with \\n") {
    val text = "Here is some text\rthat spans across\rmultiple lines\r"
    val normalisedText = ImageResponse.normaliseNewlineChars(text)
    normalisedText shouldBe "Here is some text\nthat spans across\nmultiple lines\n"
  }

  it("should replace \\r\\n linebreaks with \\n") {
    val text = "Here is some text\r\nthat spans across\r\nmultiple lines\r\n"
    val normalisedText = ImageResponse.normaliseNewlineChars(text)
    normalisedText shouldBe "Here is some text\nthat spans across\nmultiple lines\n"
  }

  it("not cause a stack overflow when many consecutive newline characters are present") {
    val text = "\n\r\n\n\n\r\r\r\n" * 10000
    val normalisedText = ImageResponse.normaliseNewlineChars(text)
    normalisedText shouldBe "\n"
  }

  it("should not touch \\n linebreaks") {
    val text = "Here is some text\nthat spans across\nmultiple lines\n"
    val normalisedText = ImageResponse.normaliseNewlineChars(text)
    normalisedText shouldBe "Here is some text\nthat spans across\nmultiple lines\n"
  }

  it("should indicate if image can be deleted" +
    "(it can be deleted if there is no exports or usages)") {

    import TestUtils._

    val testCrop = Crop(Some("crop-id"), None, None, CropSpec("test-uri", Bounds(0, 0, 0, 0), None, rotation = None), None, Nil)
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

  it("should extract set of configured alias fields from sourcewrapper if fields exist in image") {
    val image = createImage(
      id = "test-image-with-filemetadata",
      agency,
      fileMetadata = Some(FileMetadata(
        iptc = Map(
          "Caption/Abstract" -> "the description",
          "Caption Writer/Editor" -> "the editor"
        ),
        exif = Map(
          "Copyright" -> "the copyright",
          "Artist" -> "the artist"
        ),
        xmp = Map(
          "foo" -> JsString("bar"),
          "toolong" -> JsString(stringLongerThan(100000)),
          "org:ProgrammeMaker" -> JsString("xmp programme maker"),
          "aux:Lens" -> JsString("xmp aux lens")
        )))
    )
    val json = Json.toJson(image)
    val sourceWrapper = SourceWrapper[Image](json, image, fromIndex="test_index")

    val extractedFields = ImageResponse.extractAliasFieldValues(mediaApiConfig, sourceWrapper)

    extractedFields.nonEmpty shouldEqual true
    // 3 regular fields plus c2paMetadataAvailable, which is always present for matchViaExistence
    // fields (as an explicit `false` here, since this image has no c2pa data - see below)
    extractedFields should have length 4

    extractedFields.contains("orgProgrammeMaker" -> JsString("xmp programme maker")) shouldEqual true
    extractedFields.contains("auxLens" -> JsString("xmp aux lens")) shouldEqual true
    extractedFields.contains("captionWriter" -> JsString("the editor")) shouldEqual true
    extractedFields.contains("c2paMetadataAvailable" -> JsBoolean(false)) shouldEqual true
  }

  it("should return only the matchViaExistence alias fields (as false) if no other configured alias fields exist in image") {
    val image = createImage(
      id = "test-image-with-no-filemetadata",
      agency,
      fileMetadata = Some(FileMetadata())
    )
    val json = Json.toJson(image)
    val sourceWrapper = SourceWrapper[Image](json, image, fromIndex="test_index")

    val extractedFields = ImageResponse.extractAliasFieldValues(mediaApiConfig, sourceWrapper)

    extractedFields shouldEqual Seq("c2paMetadataAvailable" -> JsBoolean(false))
  }

  it("should extract a matchViaExistence alias field as true when the underlying field is present") {
    val image = createImage(
      id = "test-image-with-c2pa",
      agency,
      fileMetadata = Some(FileMetadata(c2pa = FileMetadata.C2paAvailable))
    )
    val json = Json.toJson(image)
    val sourceWrapper = SourceWrapper[Image](json, image, fromIndex="test_index")

    val extractedFields = ImageResponse.extractAliasFieldValues(mediaApiConfig, sourceWrapper)

    extractedFields.contains("c2paMetadataAvailable" -> JsBoolean(true)) shouldEqual true
  }

  it("should extract a matchViaExistence alias field as false, rather than omitting it, when the underlying field is absent") {
    val image = createImage(
      id = "test-image-without-c2pa",
      agency,
      fileMetadata = Some(FileMetadata(c2pa = FileMetadata.NoC2PA))
    )
    val json = Json.toJson(image)
    val sourceWrapper = SourceWrapper[Image](json, image, fromIndex="test_index")

    val extractedFields = ImageResponse.extractAliasFieldValues(mediaApiConfig, sourceWrapper)

    extractedFields.contains("c2paMetadataAvailable" -> JsBoolean(false)) shouldEqual true
  }
}
