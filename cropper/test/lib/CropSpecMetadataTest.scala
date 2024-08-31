package lib

import com.gu.mediaservice.model._
import org.joda.time.DateTime
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class CropSpecMetadataTest extends AnyFunSpec with Matchers with CropSpecMetadata {

  private val cropSpec = CropSpec(
    uri = "/test",
    bounds = Bounds(1, 2, 3, 4), aspectRatio = Some("16:9"), `type` = ExportType.default
  )
  private val crop = Crop(
    id = Some("123"),
    specification = cropSpec,
    author = Some("Tony McCrae"),
    date = Some(DateTime.now),
    master = None,
    assets = List.empty,
  )
  private val dimensions = Dimensions(640, 480)

  describe("metadata for crop spec") {
    it("should serialize crop spec to key value pairs") {
      val metadata = metadataForCrop(crop, dimensions)

      metadata("width") shouldBe "640"
      metadata("height") shouldBe "480"
      metadata.get("aspect-ratio") shouldBe Some("16:9")
      metadata.get("author") shouldBe Some("Tony McCrae")
    }

    it("should handle empty optional fields") {
      val withEmptyField = cropSpec.copy(aspectRatio = None)

      val metadata = metadataForCrop(crop.copy(specification = withEmptyField, author = None), dimensions)

      metadata.get("aspect-ratio") shouldBe None
      metadata.get("author") shouldBe Some("None")  // TODO this does not look intentional!
    }

    it("should round trip metadata back to crop spec") {
      val metadata = metadataForCrop(crop, dimensions)

      val roundTripped = cropSpecFromMetadata(metadata)

      roundTripped shouldBe Some(cropSpec)
    }
  }

}
