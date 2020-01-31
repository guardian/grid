package lib

import com.gu.mediaservice.model._
import org.scalatest.{FunSpec, Matchers}

class CropsTest extends FunSpec with Matchers {
  it("should return JPEG when the input type is a JPEG") {
    Crops.cropType(Jpeg, "True Color", hasAlpha = false) shouldBe Jpeg
    Crops.cropType(Jpeg, "Monkey", hasAlpha = false) shouldBe Jpeg
  }

  it("should return PNG when the input type is PNG and it has alpha") {
    Crops.cropType(Png, "Monkey", hasAlpha = true) shouldBe Png
  }

  it("should return PNG when the input type is PNG and it has alpha even if it is True Color") {
    Crops.cropType(Png, "True Color", hasAlpha = true) shouldBe Png
  }

  it("should return PNG when the input type is PNG and it is NOT true color (a graphic)") {
    Crops.cropType(Png, "Monkey", hasAlpha = false) shouldBe Png
  }

  it("should return JPEG when the input type is PNG and it is true color") {
    Crops.cropType(Png, "True Color", hasAlpha = false) shouldBe Jpeg
  }

  it("should return PNG when the input type is TIFF and it has alpha") {
    Crops.cropType(Tiff, "Monkey", hasAlpha = true) shouldBe Png
  }

  it("should return PNG when the input type is TIFF and it doesn't have alpha or is true color") {
    Crops.cropType(Tiff, "Monkey", hasAlpha = false) shouldBe Png
  }

  it("should return JPEG when the input type is TIFF and it doesn't have alpha and it is true color") {
    Crops.cropType(Tiff, "TrueColor", hasAlpha = false) shouldBe Jpeg
  }
}
