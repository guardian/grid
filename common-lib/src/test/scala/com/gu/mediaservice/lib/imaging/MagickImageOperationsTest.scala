package com.gu.mediaservice.lib.imaging

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}

import java.io.File
import com.gu.mediaservice.model.Jpeg
import org.scalatest.time.{Millis, Span}
import org.scalatest.Ignore
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

import scala.concurrent.ExecutionContext.Implicits.global

// This test is disabled for now as it doesn't run on our CI environment, because GraphicsMagick is not present...
@Ignore
class MagickImageOperationsTest extends AnyFunSpec with Matchers with ScalaFutures {

  implicit override val patienceConfig: PatienceConfig = PatienceConfig(timeout = Span(1000, Millis), interval = Span(25, Millis))
  implicit val logMarker: LogMarker = MarkerMap()

  describe("identifyColourModel") {
    it("should return RGB for a JPG image with RGB image data and no embedded profile") {
      val image = fileAt("rgb-wo-profile.jpg")
      val colourModelFuture = MagickImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an RGB embedded profile") {
      val image = fileAt("rgb-with-rgb-profile.jpg")
      val colourModelFuture = MagickImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an incorrect CMYK embedded profile") {
      val image = fileAt("rgb-with-cmyk-profile.jpg")
      val colourModelFuture = MagickImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("RGB"))
      }
    }

    it("should return CMYK for a JPG image with CMYK image data") {
      val image = fileAt("cmyk.jpg")
      val colourModelFuture = MagickImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("CMYK"))
      }
    }

    it("should return Greyscale for a JPG image with greyscale image data and no embedded profile") {
      val image = fileAt("grayscale-wo-profile.jpg")
      val colourModelFuture = MagickImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("Greyscale"))
      }
    }
  }

  // TODO: test cropImage and its conversions

  def fileAt(resourcePath: String): File = {
    new File(getClass.getResource(s"/$resourcePath").toURI)
  }

}
