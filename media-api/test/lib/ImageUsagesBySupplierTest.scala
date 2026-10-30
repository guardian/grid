package lib

import com.gu.mediaservice.model.{Agency, FileMetadata, ImageMetadata}
import lib.elasticsearch.Fixtures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json.Json

class ImageUsagesBySupplierTest extends AnyFunSpec with Matchers with Fixtures {
  describe("ImageUsagesBySupplier") {
    val image = createImage(
      "image-id",
      Agency("Getty Images"),
      fileMetadata = Some(FileMetadata(
        iptc = Map("Copyright Notice" -> "© Getty", "Credit" -> "Getty Images", "Caption/Abstract" -> "not needed"),
        getty = Map("Asset ID" -> "123", "Original Filename" -> "file.jpg", "Image Rank" -> "not needed")
      ))
    ).copy(
      originalMetadata = ImageMetadata(
        byline = Some("A Photographer"), suppliersReference = Some("ref-1"), description = Some("A description"), title = Some("not needed")
      ),
      identifiers = Map("picdarurn" -> "urn-1", "other" -> "not needed")
    )

    it("only keeps the metadata needed to report on the image") {
      val json = Json.toJson(ImageUsagesBySupplier(image, Nil))

      (json \ "originalMetadata").get shouldBe Json.obj(
        "byline" -> "A Photographer",
        "suppliersReference" -> "ref-1",
        "description" -> "A description",
        "iptc" -> Json.obj("Copyright Notice" -> "© Getty", "Credit" -> "Getty Images"),
        "getty" -> Json.obj("Asset ID" -> "123", "Original Filename" -> "file.jpg")
      )
      (json \ "fileMetadata").toOption shouldBe None
      (json \ "identifiers").get shouldBe Json.obj("picdarurn" -> "urn-1")
    }

    describe("UsageReportingImageOriginalMetadata") {
      it("keeps only the wanted original and file metadata fields") {
        UsageReportingImageOriginalMetadata(image) shouldBe UsageReportingImageOriginalMetadata(
          byline = Some("A Photographer"),
          suppliersReference = Some("ref-1"),
          description = Some("A description"),
          iptc = Map("Copyright Notice" -> "© Getty", "Credit" -> "Getty Images"),
          getty = Map("Asset ID" -> "123", "Original Filename" -> "file.jpg")
        )
      }

      it("is empty when the image has no metadata") {
        val bareImage = createImage("bare-image", Agency("Getty Images")).copy(originalMetadata = ImageMetadata())

        UsageReportingImageOriginalMetadata(bareImage) shouldBe UsageReportingImageOriginalMetadata(None, None, None, Map.empty, Map.empty)
      }

      it("leaves out file metadata that isn't one of the wanted keys") {
        val unrelated = createImage(
          "unrelated-image",
          Agency("Getty Images"),
          fileMetadata = Some(FileMetadata(iptc = Map("Caption/Abstract" -> "not needed"), getty = Map("Image Rank" -> "not needed")))
        )

        val result = UsageReportingImageOriginalMetadata(unrelated)

        result.iptc shouldBe empty
        result.getty shouldBe empty
      }
    }
  }
}
