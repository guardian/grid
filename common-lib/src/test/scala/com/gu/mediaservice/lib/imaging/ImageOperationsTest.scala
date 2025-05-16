package com.gu.mediaservice.lib.imaging

import app.photofox.vipsffm.Vips
import com.gu.mediaservice.lib.BrowserViewableImage
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}

import java.io.File
import com.gu.mediaservice.model.{Dimensions, Instance, Jpeg, MimeType}
import org.scalatest.time.{Millis, Span}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

import scala.concurrent.ExecutionContext.Implicits.global

// This test is disabled for now as it doesn't run on our CI environment, because GraphicsMagick is not present...
class ImageOperationsTest extends AnyFunSpec with Matchers with ScalaFutures {

  Vips.init()

  implicit override val patienceConfig: PatienceConfig = PatienceConfig(timeout = Span(1000, Millis), interval = Span(25, Millis))
  implicit val logMarker: LogMarker = MarkerMap()

  describe("identifyColourModel") {
    it("should return RGB for a JPG image with RGB image data and no embedded profile") {
      val image = fileAt("rgb-wo-profile.jpg")
      val colourModelFuture = ImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an RGB embedded profile") {
      val image = fileAt("rgb-with-rgb-profile.jpg")
      val colourModelFuture = ImageOperations.identifyColourModel(image, Jpeg)
        whenReady(colourModelFuture) { colourModel =>
          colourModel should be(Some("RGB"))
      }
    }

    it("should return RGB for a PNG image with RGB image data and an embedded profile") {
      val image = fileAt("cs-black-000.png")
      val colourModelFuture = ImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an incorrect CMYK embedded profile") {
      val image = fileAt("rgb-with-cmyk-profile.jpg")
      val colourModelFuture = ImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("RGB"))
      }
    }

    it("should return CMYK for a JPG image with CMYK image data") {
      val image = fileAt("cmyk.jpg")
      val colourModelFuture = ImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("CMYK"))
      }
    }

    it("should return Greyscale for a JPG image with greyscale image data and no embedded profile") {
      val image = fileAt("grayscale-wo-profile.jpg")
      val colourModelFuture = ImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("Greyscale"))
      }
    }
  }

  describe("dimensions") {
    it("should return dimensions of horizontal image") {
      val inputFile = fileAt("exif-orientated-no-rotation.jpg")
      val dimsFuture = ImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dims =>
        dims.get shouldBe new Dimensions(3456, 2304)
      }
    }

    it("should return uncorrected dimensions for exif oriented images") {
      val inputFile = fileAt("exif-orientated.jpg")
      val dimsFuture = ImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dims =>
        dims.get shouldBe new Dimensions(3456, 2304)
      }
    }

    it("should read the correct dimensions for a tiff image") {
      val inputFile = fileAt("flower.tif")
      val dimsFuture = ImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dimOpt =>
        dimOpt should be(Symbol("defined"))
        dimOpt.get.width should be(73)
        dimOpt.get.height should be(43)
      }
    }

    it("should read the correct dimensions for a png image") {
      val inputFile = fileAt("schaik.com_pngsuite/basn0g08.png")
      val dimsFuture = ImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dimOpt =>
        dimOpt should be(Symbol("defined"))
        dimOpt.get.width should be(32)
        dimOpt.get.height should be(32)
      }
    }
  }

  // TODO: test cropImage and its conversions

  def fileAt(resourcePath: String): File = {
    new File(getClass.getResource(s"/$resourcePath").toURI)
  }

}
