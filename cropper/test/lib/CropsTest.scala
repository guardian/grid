package lib

import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.model._
import org.scalatestplus.mockito.MockitoSugar

import org.scalatest.{FunSpec, Matchers}

class CropsTest extends FunSpec with Matchers with MockitoSugar {
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

  private val config = mock[CropperConfig]
  private val store = mock[CropStore]
  private val imageOperations: ImageOperations = mock[ImageOperations]
  private val source: SourceImage = SourceImage("test", mock[Asset], valid = true, mock[ImageMetadata], mock[FileMetadata])
  private val bounds: Bounds = Bounds(10, 20, 30, 40)
  private val outputWidth = 1234

  it("should should construct a correct address for a master jpg") {
    val outputFilename = new Crops(config, store, imageOperations)
      .outputFilename(source, bounds, outputWidth, Jpeg, isMaster = true)
    outputFilename shouldBe "test/10_20_30_40/master/1234.jpg"
  }
  it("should should construct a correct address for a non-master jpg") {
    val outputFilename = new Crops(config, store, imageOperations)
      .outputFilename(source, bounds, outputWidth, Jpeg)
    outputFilename shouldBe "test/10_20_30_40/1234.jpg"
  }
  it("should should construct a correct address for a non-master tiff") {
    val outputFilename = new Crops(config, store, imageOperations)
      .outputFilename(source, bounds, outputWidth, Tiff)
    outputFilename shouldBe "test/10_20_30_40/1234.tiff"
  }
  it("should should construct a correct address for a non-master png") {
    val outputFilename = new Crops(config, store, imageOperations)
      .outputFilename(source, bounds, outputWidth, Png)
    outputFilename shouldBe "test/10_20_30_40/1234.png"
  }
}
