package lib

import com.gu.mediaservice.lib.config.GridConfigResources
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage.{PendingUsageStatus, PrintUsage, Usage}
import lib.elasticsearch.{Fixtures, SourceWrapper}
import org.joda.time.DateTime.now
import org.scalatest.{FunSpec, Matchers}
import play.api.Configuration
import play.api.libs.json._

class ImageResponseTest extends FunSpec with Matchers with Fixtures {

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
    null
  ))

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
    val sourceWrapper = SourceWrapper[Image](json, image)

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
    val sourceWrapper = SourceWrapper[Image](json, image)

    val extractedFields = ImageResponse.extractAliasFieldValues(mediaApiConfig, sourceWrapper)

    extractedFields.isEmpty shouldEqual true
  }
}
