package com.gu.mediaservice.lib.imaging

import java.io.File

import org.scalatest.concurrent.ScalaFutures
import org.scalatest.time.{Millis, Span}
import org.scalatest.{FunSpec, Ignore, Matchers}

import scala.concurrent.ExecutionContext.Implicits.global

// This test is disabled for now as it doesn't run on our CI environment, because GraphicsMagick is not present...
@Ignore
class ImageOperationsTest extends FunSpec with Matchers with ScalaFutures {

  implicit override val patienceConfig = PatienceConfig(timeout = Span(1000, Millis), interval = Span(25, Millis))

  describe("identifyColourModel") {
    it("should return RGB for a JPG image with RGB image data and no embedded profile") {
      val image = fileAt("rgb-wo-profile.jpg")
      val colourModelFuture = ImageOperations.identifyColourModel(image, "image/jpeg")
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an RGB embedded profile") {
      val image = fileAt("rgb-with-rgb-profile.jpg")
      val colourModelFuture = ImageOperations.identifyColourModel(image, "image/jpeg")
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an incorrect CMYK embedded profile") {
      val image = fileAt("rgb-with-cmyk-profile.jpg")
      val colourModelFuture = ImageOperations.identifyColourModel(image, "image/jpeg")
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("RGB"))
      }
    }

    it("should return CMYK for a JPG image with CMYK image data") {
      val image = fileAt("cmyk.jpg")
      val colourModelFuture = ImageOperations.identifyColourModel(image, "image/jpeg")
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("CMYK"))
      }
    }

    it("should return GRAYSCALE for a JPG image with GRAYSCALE image data and no embedded profile") {
      val image = fileAt("grayscale-wo-profile.jpg")
      val colourModelFuture = ImageOperations.identifyColourModel(image, "image/jpeg")
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("GRAYSCALE"))
      }
    }
  }

  // TODO: test cropImage and its conversions

  def fileAt(resourcePath: String): File = {
    new File(getClass.getResource(s"/$resourcePath").toURI)
  }

}
