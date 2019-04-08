package lib

import com.gu.mediaservice.lib.imaging.ImageOperations
import org.scalatest.{FunSpec, Matchers}

class CropsTest extends FunSpec with Matchers {
  val png = "image/png"
  val jpeg = "image/jpeg"

  it("should return JPEG when the input type isn't PNG") {
    Crops.cropType(jpeg, "True Color", hasAlpha = false) shouldBe ImageOperations.Jpeg
    Crops.cropType(jpeg, "Monkey", hasAlpha = false) shouldBe ImageOperations.Jpeg
  }

  it("should return PNG when the input type is PNG and it has alpha") {
    Crops.cropType(png, "Monkey", hasAlpha = true) shouldBe ImageOperations.Png
  }

  it("should return PNG when the input type is PNG and it has alpha even if it is True Color") {
    Crops.cropType(png, "True Color", hasAlpha = true) shouldBe ImageOperations.Png
  }

  it("should return PNG when the input type is PNG and it is NOT true color (a graphic)") {
    Crops.cropType(png, "Monkey", hasAlpha = false) shouldBe ImageOperations.Png
  }

  it("should return JPEG when the input type is PNG and it is true color") {
    Crops.cropType(png, "True Color", hasAlpha = false) shouldBe ImageOperations.Jpeg
  }
}
