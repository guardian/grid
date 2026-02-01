package com.gu.mediaservice.lib.imaging

import app.photofox.vipsffm.Vips
import com.gu.mediaservice.lib.BrowserViewableImage
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model._
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.time.{Millis, Span}

import java.io.File

class VipsImageOperationsTest extends AnyFunSpec with Matchers with ScalaFutures {

  Vips.init()

  implicit override val patienceConfig: PatienceConfig = PatienceConfig(timeout = Span(1000, Millis), interval = Span(25, Millis))
  implicit val logMarker: LogMarker = MarkerMap()

  val vipsImageOperations = new VipsImageOperations()

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
  }

  def fileAt(resourcePath: String): File = {
    new File(getClass.getResource(s"/$resourcePath").toURI)
  }

  def tempFileNamed(filename: String, suffix: String): File = {
    File.createTempFile(filename, suffix)
  }

}
