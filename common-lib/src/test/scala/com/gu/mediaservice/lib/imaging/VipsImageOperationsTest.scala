package com.gu.mediaservice.lib.imaging

import app.photofox.vipsffm.VImage
import com.gu.mediaservice.lib.BrowserViewableImage
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model._
import org.apache.commons.io.FileUtils
import org.scalatest.Ignore
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.time.{Millis, Span}

import java.io.File
import java.lang.foreign.Arena
import scala.concurrent.Future

// This test is disabled for now as it doesn't run on our CI environment, because libvips is not present...
@Ignore
class VipsImageOperationsTest extends AnyFunSpec with Matchers with ScalaFutures {

  implicit override val patienceConfig: PatienceConfig = PatienceConfig(timeout = Span(1000, Millis), interval = Span(25, Millis))
  implicit val logMarker: LogMarker = MarkerMap()

  def vipsImageOperations = new VipsImageOperations()

  describe("thumbnail") {
    it("should write thumbnail to output file") {
      val image = fileAt("IMG_4403.jpg")

      val outputFile = tempFileNamed("thumbnail", ".jpg")
      val browserViewableImageImage = BrowserViewableImage("an-image-id", image, Tiff, Map.empty, isTransformedFromSource = false)

      val eventualThumbnail = vipsImageOperations.createThumbnail(browserViewableImageImage, 240, 95, outputFile, None, None, None)
      whenReady(eventualThumbnail) { r =>
        r._1.isFile should be(true)
      }
    }

    it("should correct for exif orientation if provided") {
      val image = fileAt("IMG_4445.jpg")

      val outputFile = tempFileNamed("thumbnail-tall", ".jpg")
      val browserViewableImageImage = BrowserViewableImage("an-image-id", image, Tiff, Map.empty, isTransformedFromSource = false)

      // Use a large tall thumbnail to expose out of order read which exceeds the line cache
      val eventualThumbnail = vipsImageOperations.createThumbnail(browserViewableImageImage, 2800, 95, outputFile, None, None, Some(OrientationMetadata(exifOrientation = Some(6))))
      whenReady(eventualThumbnail) { r =>
        r._1.isFile should be(true)
      }
    }

    it("render PNG with alpha correctly") {
      val image = fileAt("with-alpha.png")

      val outputFile = tempFileNamed("thumbnail-png-with-alpha", ".jpg")
      val browserViewableImageImage = BrowserViewableImage("an-image-id", image, Tiff, Map.empty, isTransformedFromSource = false)

      val eventualThumbnail = vipsImageOperations.createThumbnail(browserViewableImageImage, 1000, 95, outputFile, None, None, None)
      whenReady(eventualThumbnail) { r =>
        r._1.isFile should be(true)
      }
    }

    it("render TIF with alpha correctly") {
      val image = fileAt("with-alpha.tif")

      val outputFile = tempFileNamed("thumbnail-tif-with-alpha", ".jpg")
      val browserViewableImageImage = BrowserViewableImage("an-image-id", image, Tiff, Map.empty, isTransformedFromSource = false)

      val eventualThumbnail = vipsImageOperations.createThumbnail(browserViewableImageImage, 1000, 95, outputFile, None, None, None)
      whenReady(eventualThumbnail) { r =>
        r._1.isFile should be(true)
      }
    }
  }

  describe("resize") {
    it("should output resized image to file in chosen format") {
      implicit val arena: Arena = Arena.ofConfined
      val fullSizedJpegImage = fileAt("IMG_4403.jpg")

      val eventualResized = vipsImageOperations.resizeImage(fullSizedJpegImage, Some(Jpeg), Dimensions(140, 100), 85, tempDirForOutputFiles, Jpeg)
      whenReady(eventualResized) { resized =>
        arena.close()
        resized.isFile should be(true)
      }
    }

    it("render PNG with alpha correctly") {
      implicit val arena: Arena = Arena.ofShared
      val fullSizedImage = fileAt("with-alpha.png")

      val eventualResized = vipsImageOperations.resizeImage(fullSizedImage, Some(Png), Dimensions(800, 600), 95, FileUtils.getTempDirectory, Png)

      whenReady(eventualResized) { resized =>
        arena.close()
        resized.isFile should be(true)
      }
    }
  }

  describe("alpha") {
    it("should return false for RGB for a Jpeg with no alpha") {
      implicit val arena: Arena = Arena.ofShared
      val image =  VImage.newFromFile(arena, fileAt("rgb-wo-profile.jpg").getAbsolutePath)
      val hasAlpha = vipsImageOperations.hasAlpha(image)
      arena.close()
      hasAlpha should be(false)
    }

    it("should return true for PNG with alpha") {
      implicit val arena: Arena = Arena.ofShared
      val image = VImage.newFromFile(arena, fileAt("with-alpha.png").getAbsolutePath)
      val hasAlpha = vipsImageOperations.hasAlpha(image)
      arena.close()
      hasAlpha should be(true)
    }
  }

  describe("identifyColourModel") {
    it("should return RGB for a JPG image with RGB image data and no embedded profile") {
      val image = fileAt("rgb-wo-profile.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an RGB embedded profile") {
      val image = fileAt("rgb-with-rgb-profile.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
        whenReady(colourModelFuture) { colourModel =>
          colourModel should be(Some("RGB"))
      }
    }

    it("should return RGB for a PNG image with RGB image data and an embedded profile") {
      val image = fileAt("cs-black-000.png")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an incorrect CMYK embedded profile") {
      val image = fileAt("rgb-with-cmyk-profile.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("RGB"))
      }
    }

    it("should return CMYK for a JPG image with CMYK image data") {
      val image = fileAt("cmyk.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("CMYK"))
      }
    }

    it("should return Greyscale for a JPG image with greyscale image data and no embedded profile") {
      val image = fileAt("grayscale-wo-profile.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("Greyscale"))
      }
    }

    it("should return RGB for a PNG image with 16 bit RGB image data") {
      val image = fileAt("schaik.com_pngsuite/basi2c16.png")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Png)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("RGB"))
      }
    }

    it("should return LAB for a TIFF image with LAB16 image data") {
      val image = fileAt("halfdome_LAB16.tif")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Png)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("LAB"))
      }
    }

    it("should return CMYK for a TIFF image with CMYK image data") {
      val image = fileAt("CMYK-with-profile.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Png)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("CMYK"))
      }
    }
  }

  describe("dimensions") {
    it("should return dimensions of horizontal image") {
      val inputFile = fileAt("exif-orientated-no-rotation.jpg")
      val dimsFuture = vipsImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dims =>
        dims.get shouldBe new Dimensions(3456, 2304)
      }
    }

    it("should return uncorrected dimensions for exif oriented images") {
      val inputFile = fileAt("exif-orientated.jpg")
      val dimsFuture = vipsImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dims =>
        dims.get shouldBe new Dimensions(3456, 2304)
      }
    }

    it("should read the correct dimensions for a tiff image") {
      val inputFile = fileAt("flower.tif")
      val dimsFuture = vipsImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dimOpt =>
        dimOpt should be(Symbol("defined"))
        dimOpt.get.width should be(73)
        dimOpt.get.height should be(43)
      }
    }

    it("should read the correct dimensions for a png image") {
      val inputFile = fileAt("schaik.com_pngsuite/basn0g08.png")
      val dimsFuture = vipsImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dimOpt =>
        dimOpt should be(Symbol("defined"))
        dimOpt.get.width should be(32)
        dimOpt.get.height should be(32)
      }
    }
  }

  describe("orientation") {
    it("should capture exif orientation tag from JPG images") {
      val image = fileAt("exif-orientated.jpg")
      val orientationFuture = vipsImageOperations.orientation(image)
      whenReady(orientationFuture) { orientationOpt =>
        orientationOpt should be(defined)
        orientationOpt.get.exifOrientation should be(Some(6))
      }
    }

    it("should ignore 0 degree exif orientation tag as it has no material effect") {
      val image = fileAt("exif-orientated-no-rotation.jpg")
      val orientationFuture = vipsImageOperations.orientation(image)
      whenReady(orientationFuture) { orientationOpt =>
        orientationOpt should be(None)
      }
    }
  }

  describe("graphic detection") {
    it("should return not graphic for true colour jpeg") {
      val arena = Arena.ofConfined
      val image = VImage.newFromFile(arena, fileAt("exif-orientated-no-rotation.jpg").getAbsolutePath)
      vipsImageOperations.isGraphic(image)(arena) should be(false)
      arena.close()
    }

    it("should return is graphic for depth 2 tiff") {
      val arena = Arena.ofConfined
      val image = VImage.newFromFile(arena, fileAt("flower.tif").getAbsolutePath)
      vipsImageOperations.isGraphic(image)(arena) should be(true)
      arena.close()
    }

    it("should return not graphic for depth 4 png with alpha") {
      val arena = Arena.ofConfined
      val image = VImage.newFromFile(arena, fileAt("schaik.com_pngsuite/tbbn0g04.png").getAbsolutePath)
      vipsImageOperations.isGraphic(image)(arena) should be(true)
      arena.close()
    }

    it("should return is graphic for depth 8 indexed png") {
      val arena = Arena.ofConfined
      val image = VImage.newFromFile(arena, fileAt("schaik.com_pngsuite/basn3p08.png").getAbsolutePath)
      vipsImageOperations.isGraphic(image)(arena) should be(true)
      arena.close()
    }

  }

  def fileAt(resourcePath: String): File = {
    new File(getClass.getResource(s"/$resourcePath").toURI)
  }

  private def tempDirForOutputFiles: File = {
    FileUtils.getTempDirectory
  }

  private def tempFileNamed(filename: String, suffix: String): File = {
    File.createTempFile(filename, suffix)
  }

}
