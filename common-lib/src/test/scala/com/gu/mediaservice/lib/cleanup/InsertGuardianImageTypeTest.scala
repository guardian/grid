package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.{FileMetadata, Image}
import org.scalatest.OptionValues
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json.JsString

class InsertGuardianImageTypeTest extends AnyFlatSpec with Matchers with OptionValues with MetadataHelper {
  def imageWithDigitalSourceType(dst: String): Image = {
    val base = createImageFromMetadata()
    val fileMeta = FileMetadata(
      xmp = Map("Iptc4xmpExt:DigitalSourceType" -> JsString(s"http://cv.iptc.org/newscodes/digitalsourcetype/$dst"))
    )
    base.copy(fileMetadata = fileMeta)
  }

  it should "insert image type Photograph from a 'digitalCapture'" in {
    val img = imageWithDigitalSourceType("digitalCapture")

    val inserted = InsertGuardianImageType(img)

    inserted.metadata.imageType.value shouldBe "Photograph"
  }

  it should "insert image type Illustration from a 'digitalCreation'" in {
    val img = imageWithDigitalSourceType("digitalCreation")

    val inserted = InsertGuardianImageType(img)

    inserted.metadata.imageType.value shouldBe "Illustration"
  }

  it should "insert image type Composite from a 'composite'" in {
    val img = imageWithDigitalSourceType("composite")

    val inserted = InsertGuardianImageType(img)

    inserted.metadata.imageType.value shouldBe "Composite"
  }

  it should "not insert an image type from a 'print'" in {
    val img = imageWithDigitalSourceType("print")

    val inserted = InsertGuardianImageType(img)

    inserted.metadata.imageType shouldBe None
  }
}
