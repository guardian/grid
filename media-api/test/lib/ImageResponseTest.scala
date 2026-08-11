package lib

import com.gu.mediaservice.lib.aws.S3
import com.gu.mediaservice.lib.config.GridConfigResources
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

class ImageResponseTest extends AnyFunSpec with Matchers with Fixtures {

  val mediaApiConfig = new MediaApiConfig(GridConfigResources(
    Configuration.from(USED_CONFIGS_IN_TEST ++ Map(
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
        )
      )
    ) ++ MOCK_CONFIG_KEYS.map(_ -> NOT_USED_IN_TEST).toMap),
    null,
    new ApplicationLifecycle {
      override def addStopHook(hook: () => Future[_]): Unit = {}
      override def stop(): Future[_] = Future.successful(())
    }
  ))

  val imageResponse = new ImageResponse(mediaApiConfig, mock[S3], mock[UsageQuota])

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

  it("should return empty set of extract configured alias fields from sourcewrapper if fields do not exist in image") {
    val image = createImage(
      id = "test-image-with-no-filemetadata",
      agency,
      fileMetadata = Some(FileMetadata())
    )
    val json = Json.toJson(image)
    val sourceWrapper = SourceWrapper[Image](json, image, fromIndex="test_index")

    val extractedFields = ImageResponse.extractAliasFieldValues(mediaApiConfig, sourceWrapper)

    extractedFields.isEmpty shouldEqual true
  }

  describe("updateRightsAndRestrictions") {
    describe("should map the following categories to pr-and-third-party and set the legacyCategory with the original category name and maintain old fields") {
      it("handout") {
        val inputJson = Json.obj(
          "usageRights" -> JsObject(
            Map("category" ->  JsString("handout"),
              "restrictions" -> JsString("restrictions"))
          )
        )
        val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
        val result: JsResult[JsObject] = inputJson.transform(transformer)
        result shouldBe a[JsSuccess[_]]
        result.get shouldBe Json.obj(
          "usageRights" -> JsObject(
            Map("category" ->  JsString("pr-and-third-party"),
            "legacyCategory" -> JsString("handout"),
            "restrictions" -> JsString("restrictions"))
          )
        )
      }
      it("PR Image") {
        val inputJson = Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("PR Image"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
        val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
        val result: JsResult[JsObject] = inputJson.transform(transformer)
        result shouldBe a[JsSuccess[_]]
        result.get shouldBe Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("pr-and-third-party"),
              "legacyCategory" -> JsString("PR Image"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
      }

      it("screengrab") {
        val inputJson = Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("screengrab"),
              "source" -> JsString("source"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
        val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
        val result: JsResult[JsObject] = inputJson.transform(transformer)
        result shouldBe a[JsSuccess[_]]
        result.get shouldBe Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("pr-and-third-party"),
              "legacyCategory" -> JsString("screengrab"),
              "source" -> JsString("source"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
      }

      it("social-media") {
        val inputJson = Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("social-media"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
        val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
        val result: JsResult[JsObject] = inputJson.transform(transformer)
        result shouldBe a[JsSuccess[_]]
        result.get shouldBe Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("pr-and-third-party"),
              "legacyCategory" -> JsString("social-media"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
      }

      it("creative-commons") {
        val inputJson = Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("creative-commons"),
              "licence" -> JsString("CC BY-4.0"),
              "source" -> JsString("source"),
              "creator" -> JsString("creator"),
              "contentLink" -> JsString("link to content"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
        val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
        val result: JsResult[JsObject] = inputJson.transform(transformer)
        result shouldBe a[JsSuccess[_]]
        result.get shouldBe Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("pr-and-third-party"),
              "legacyCategory" -> JsString("creative-commons"),
              "licence" -> JsString("CC BY-4.0"),
              "source" -> JsString("source"),
              "creator" -> JsString("creator"),
              "contentLink" -> JsString("link to content"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
      }

      it("pool") {
        val inputJson = Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("pool"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
        val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
        val result: JsResult[JsObject] = inputJson.transform(transformer)
        result shouldBe a[JsSuccess[_]]
        result.get shouldBe Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("pr-and-third-party"),
              "legacyCategory" -> JsString("pool"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
      }

      it("crown-copyright") {
        val inputJson = Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("crown-copyright"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
        val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
        val result: JsResult[JsObject] = inputJson.transform(transformer)
        result shouldBe a[JsSuccess[_]]
        result.get shouldBe Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("pr-and-third-party"),
              "legacyCategory" -> JsString("crown-copyright"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
      }

      it("obituary") {
        val inputJson = Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("obituary"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
        val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
        val result: JsResult[JsObject] = inputJson.transform(transformer)
        result shouldBe a[JsSuccess[_]]
        result.get shouldBe Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("pr-and-third-party"),
              "legacyCategory" -> JsString("obituary"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
      }
      it("public-domain") {
        val inputJson = Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("public-domain"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
        val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
        val result: JsResult[JsObject] = inputJson.transform(transformer)
        result shouldBe a[JsSuccess[_]]
        result.get shouldBe Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("pr-and-third-party"),
              "legacyCategory" -> JsString("public-domain"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
      }
      it("guardian-witness") {
        val inputJson = Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("guardian-witness"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
        val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
        val result: JsResult[JsObject] = inputJson.transform(transformer)
        result shouldBe a[JsSuccess[_]]
        result.get shouldBe Json.obj(
          "usageRights" -> JsObject(
            Map(
              "category" -> JsString("pr-and-third-party"),
              "legacyCategory" -> JsString("guardian-witness"),
              "restrictions" -> JsString("restrictions")
            )
          )
        )
      }
      describe("For legacy categories that have a supplier or suppliers field, these should be mapped to source") {
        it("composite") {
          val inputJson = Json.obj(
            "usageRights" -> JsObject(
              Map(
                "category" -> JsString("composite"),
                "restrictions" -> JsString("restrictions"),
                "suppliers" -> JsString("supplier1 and supplier2")
              )
            )
          )
          val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
          val result: JsResult[JsObject] = inputJson.transform(transformer)
          result shouldBe a[JsSuccess[_]]
          result.get shouldBe Json.obj(
            "usageRights" -> JsObject(
              Map(
                "category" -> JsString("pr-and-third-party"),
                "legacyCategory" -> JsString("composite"),
                "restrictions" -> JsString("restrictions"),
                "suppliers" -> JsString("supplier1 and supplier2"),
                "source" -> JsString("supplier1 and supplier2")
              )
            )
          )
        }
        it("agency") {
          val inputJson = Json.obj(
            "usageRights" -> JsObject(
              Map(
                "category" -> JsString("agency"),
                "supplier" -> JsString("Action Images"),
                "suppliersCollection" -> JsString("collection"),
                "restrictions" -> JsString("restrictions")
              )
            )
          )
          val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
          val result: JsResult[JsObject] = inputJson.transform(transformer)
          result shouldBe a[JsSuccess[_]]
          result.get shouldBe Json.obj(
            "usageRights" -> JsObject(
              Map(
                "category" -> JsString("pr-and-third-party"),
                "legacyCategory" -> JsString("agency"),
                "supplier" -> JsString("Action Images"),
                "suppliersCollection" -> JsString("collection"),
                "restrictions" -> JsString("restrictions"),
                "source" -> JsString("Action Images")
              )
            )
          )
        }
        it("commissioned-agency") {
          val inputJson = Json.obj(
            "usageRights" -> JsObject(
              Map(
                "category" -> JsString("commissioned-agency"),
                "supplier" -> JsString("Action Images"),
                "restrictions" -> JsString("restrictions")
              )
            )
          )
          val transformer = imageResponse.updateRightsAndRestrictions(inputJson)
          val result: JsResult[JsObject] = inputJson.transform(transformer)
          result shouldBe a[JsSuccess[_]]
          result.get shouldBe Json.obj(
            "usageRights" -> JsObject(
              Map(
                "category" -> JsString("pr-and-third-party"),
                "legacyCategory" -> JsString("commissioned-agency"),
                "supplier" -> JsString("Action Images"),
                "restrictions" -> JsString("restrictions"),
                "source" -> JsString("Action Images")
              )
            )
          )
        }
      }
    }
  }
}
