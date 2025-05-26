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
      val colourModelFuture = ImageOperations.getImageInformation(image)
      whenReady(colourModelFuture) { colourModel =>
        colourModel._3 should be(Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an RGB embedded profile") {
      val image = fileAt("rgb-with-rgb-profile.jpg")
      val colourModelFuture = ImageOperations.getImageInformation(image)
      whenReady(colourModelFuture) { colourModel =>
        colourModel._3 should be(Some("RGB"))
      }
    }

    it("should return RGB for a PNG image with RGB image data and an embedded profile") {
      val image = fileAt("cs-black-000.png")
      val colourModelFuture = ImageOperations.getImageInformation(image)
      whenReady(colourModelFuture) { colourModel =>
        colourModel._3 should be(Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an incorrect CMYK embedded profile") {
      val image = fileAt("rgb-with-cmyk-profile.jpg")
      val colourModelFuture = ImageOperations.getImageInformation(image)
      whenReady(colourModelFuture) { colourModel =>
        colourModel._3 should be(Some("RGB"))
      }
    }

    it("should return CMYK for a JPG image with CMYK image data") {
      val image = fileAt("cmyk.jpg")
      val colourModelFuture = ImageOperations.getImageInformation(image)
      whenReady(colourModelFuture) { colourModel =>
        colourModel._3 should be(Some("CMYK"))
      }
    }

    it("should return Greyscale for a JPG image with greyscale image data and no embedded profile") {
      val image = fileAt("grayscale-wo-profile.jpg")
      val colourModelFuture = ImageOperations.getImageInformation(image)
      whenReady(colourModelFuture) { colourModel =>
        colourModel._3 should be(Some("Greyscale"))
      }
    }

    it("should return TGB for a PNG image with 16 bit RGB image data") {
      val image = fileAt("ProPhoto_32bit (3c0d253874a4a76559672e9e90333aa55a7e38e6) (1).png")
      val colourModelFuture = ImageOperations.getImageInformation(image)
      whenReady(colourModelFuture) { colourModel =>
        colourModel._3 should be(Some("RGB"))
      }
    }

    it("should return LAB for a TIFF image with LAB16 image data") {
      val image = fileAt("Lab 16bpc (7d0b7c7b8e890d7e5d369093aa437bd833e20f71).tiff")
      val colourModelFuture = ImageOperations.getImageInformation(image)
      whenReady(colourModelFuture) { colourModel =>
        colourModel._3 should be(Some("LAB"))
      }
    }

    it("should return CMYK for a TIFF image with CMYK image data") {
      val image = fileAt("ilkafranz_gracedent-4_NewsprintCMYK (f7e5fd4f0d4a9d3aba8acb65bb19ff936c3a03a9) (f7e5fd4f0d4a9d3aba8acb65bb19ff936c3a03a9).tiff")
      val colourModelFuture = ImageOperations.getImageInformation(image)
      whenReady(colourModelFuture) { colourModel =>
        colourModel._3 should be(Some("CMYK"))
      }
    }
  }

  describe("dimensions") {
    it("should return dimensions of horizontal image") {
      val inputFile = fileAt("exif-orientated-no-rotation.jpg")
      val dimsFuture = ImageOperations.getImageInformation(inputFile)
      whenReady(dimsFuture) { dims =>
        dims._1.get shouldBe new Dimensions(3456, 2304)
      }
    }

    it("should return uncorrected dimensions for exif oriented images") {
      val inputFile = fileAt("exif-orientated.jpg")
      val dimsFuture = ImageOperations.getImageInformation(inputFile)
      whenReady(dimsFuture) { dims =>
        dims._1.get shouldBe new Dimensions(3456, 2304)
      }
    }

    it("should read the correct dimensions for a tiff image") {
      val inputFile = fileAt("flower.tif")
      val dimsFuture = ImageOperations.getImageInformation(inputFile)
      whenReady(dimsFuture) { dimOpt =>
        dimOpt._1 should be(Symbol("defined"))
        dimOpt._1.get.width should be(73)
        dimOpt._1.get.height should be(43)
      }
    }

    it("should read the correct dimensions for a png image") {
      val inputFile = fileAt("schaik.com_pngsuite/basn0g08.png")
      val dimsFuture = ImageOperations.getImageInformation(inputFile)
      whenReady(dimsFuture) { dimOpt =>
        dimOpt._1 should be(Symbol("defined"))
        dimOpt._1.get.width should be(32)
        dimOpt._1.get.height should be(32)
      }
    }
  }

  describe("orientation") {
    it("should capture exif orientation tag from JPG images") {
      val image = fileAt("exif-orientated.jpg")
      val orientationFuture = ImageOperations.getImageInformation(image)
      whenReady(orientationFuture) { orientationOpt =>
        orientationOpt._2 should be(defined)
        orientationOpt._2.get.exifOrientation should be(Some(6))
      }
    }

    it("should ignore 0 degree exif orientation tag as it has no material effect") {
      val image = fileAt("exif-orientated-no-rotation.jpg")
      val orientationFuture = ImageOperations.getImageInformation(image)
      whenReady(orientationFuture) { orientationOpt =>
        orientationOpt._2 should be(None)
      }
    }
  }

  // TODO: test cropImage and its conversions

  def fileAt(resourcePath: String): File = {
    new File(getClass.getResource(s"/$resourcePath").toURI)
  }

}
