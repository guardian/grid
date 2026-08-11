package lib

import com.gu.mediaservice.lib.auth.ReadOnly
import com.gu.mediaservice.lib.aws.S3
import com.gu.mediaservice.lib.config.GridConfigResources
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.lib.config.CommonConfigFixtures
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage.{PendingUsageStatus, PrintUsage, Usage}
import lib.elasticsearch.{Fixtures, SourceWrapper}
import org.joda.time.DateTime.now
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar.mock
import play.api.Configuration
import play.api.inject.ApplicationLifecycle
import play.api.libs.json._

import scala.concurrent.Future

class ImageResponseTest extends AnyFunSpec with Matchers with Fixtures with CommonConfigFixtures{
  val ELASTIC_SEARCH_CONFIG = Map(
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
      )))

  val mediaApiConfig = new MediaApiConfig(GridConfigResources(
    Configuration.from(commonConfigurations ++ ELASTIC_SEARCH_CONFIG),
    null,
    new ApplicationLifecycle {
      override def addStopHook(hook: () => Future[_]): Unit = {}
      override def stop(): Future[_] = Future.successful(())
    }
  ))

  val imageResponse = new ImageResponse(mediaApiConfig, mock[S3], mock[UsageQuota])
  implicit val logMarker: LogMarker = mock[LogMarker]


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
    extractedFields should have length 3

    extractedFields.contains("orgProgrammeMaker" -> JsString("xmp programme maker")) shouldEqual true
    extractedFields.contains("auxLens" -> JsString("xmp aux lens")) shouldEqual true
    extractedFields.contains("captionWriter" -> JsString("the editor")) shouldEqual true
  }

  describe("create") {
    it("should not apply the updateRightsAndRestrictions transformation when showUsageRightsV2 is set to false" ) {
      val image = createImage(
        id = "test-image",
        agency
      )
      val json = Json.toJson(image)
      val sourceWrapper = SourceWrapper[Image](json, image, fromIndex="test_index")

      val (data, _, _) = imageResponse.create("id",
        sourceWrapper,
        withWritePermission = false,
        withDeleteImagePermission = false,
        withDeleteCropsOrUsagePermission = false,
        included = Nil,
        tier = ReadOnly)

      (data \ "usageRights" \ "category").as[String] shouldBe "agency"
     }
    it("should  apply the updateRightsAndRestrictions transformation when showUsageRightsV2 is set to true") {
      val image = createImage(
        id = "test-image",
        agency
      )
      val json = Json.toJson(image)
      val sourceWrapper = SourceWrapper[Image](json, image, fromIndex="test_index")
      val mediaApiConfig = createMediaApiConfig(commonConfigurations, Map("usageRights" -> Map("showV2" -> true, "applicableV2" -> List())))

      val imageResponse = new ImageResponse(mediaApiConfig, mock[S3], mock[UsageQuota])

      val (data, _, _) = imageResponse.create("id",
        sourceWrapper,
        withWritePermission = false,
        withDeleteImagePermission = false,
        withDeleteCropsOrUsagePermission = false,
        included = Nil,
        tier = ReadOnly)

      (data \ "usageRights" \ "category").as[String] shouldBe "pr-and-third-party"
    }
  }

  describe("updateRightsAndRestrictions") {
    describe("Mapping legacy categories to pr-and-third-party as defined in PRAndThirdParty") {
      it("maps category to pr-and-third-party and retains original as legacyCategory") {
        val inputJson = Json.obj(
          "usageRights" -> Json.obj("category" -> "handout")
        )
        val result = inputJson.transform(imageResponse.updateRightsAndRestrictions(inputJson))

        result shouldBe a[JsSuccess[_]]
        result.get shouldBe Json.obj(
          "usageRights" -> Json.obj(
            "category" -> "pr-and-third-party",
            "legacyCategory" -> "handout"
          )
        )
      }

      it("preserves additional existing fields intact") {
        val inputJson = Json.obj(
          "usageRights" -> Json.obj(
            "category" -> "creative-commons",
            "licence" -> "CC BY-4.0",
            "creator" -> "creator",
            "restrictions" -> "restrictions"
          )
        )
        val result = inputJson.transform(imageResponse.updateRightsAndRestrictions(inputJson))

        result.get shouldBe Json.obj(
          "usageRights" -> Json.obj(
            "category" -> "pr-and-third-party",
            "legacyCategory" -> "creative-commons",
            "licence" -> "CC BY-4.0",
            "creator" -> "creator",
            "restrictions" -> "restrictions"
          )
        )
      }

      it("maps single supplier field to source") {
        val inputJson = Json.obj(
          "usageRights" -> Json.obj(
            "category" -> "agency",
            "supplier" -> "Action Images"
          )
        )
        val result = inputJson.transform(imageResponse.updateRightsAndRestrictions(inputJson))

        result.get shouldBe Json.obj(
          "usageRights" -> Json.obj(
            "category" -> "pr-and-third-party",
            "legacyCategory" -> "agency",
            "supplier" -> "Action Images",
            "source" -> "Action Images"
          )
        )
      }

      it("maps plural suppliers field to source") {
        val inputJson = Json.obj(
          "usageRights" -> Json.obj(
            "category" -> "composite",
            "suppliers" -> "supplier1 and supplier2"
          )
        )
        val result = inputJson.transform(imageResponse.updateRightsAndRestrictions(inputJson))

        result.get shouldBe Json.obj(
          "usageRights" -> Json.obj(
            "category" -> "pr-and-third-party",
            "legacyCategory" -> "composite",
            "suppliers" -> "supplier1 and supplier2",
            "source" -> "supplier1 and supplier2"
          )
        )
      }
      it("does not map a category that is not in the legacyCategories list") {
        val inputJson = Json.obj("usageRights" -> Json.obj("category" -> "chargeable"))
        val result = inputJson.transform(imageResponse.updateRightsAndRestrictions(inputJson))
        result.get shouldBe inputJson
      }
      it("leaves usageRights untouched when category field is missing") {
        val inputJson = Json.obj("usageRights" -> Json.obj("restrictions" -> "restrictions"))
        val result = inputJson.transform(imageResponse.updateRightsAndRestrictions(inputJson))
        result.get shouldBe inputJson
      }
    }
  }
}
