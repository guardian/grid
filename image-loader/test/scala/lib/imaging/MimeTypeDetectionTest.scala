package scala.lib.imaging

import lib.imaging.MimeTypeDetection
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.{FunSpec, Matchers}

class MimeTypeDetectionTest extends FunSpec with Matchers with ScalaFutures {
  import test.lib.ResourceHelpers._

  it("should detect jpeg mime types for images") {
    for (fileName <- List("getty.jpg", "corbis.jpg", "guardian-turner.jpg", "pa.jpg")) {
      val image = fileAt(fileName)
      MimeTypeDetection.guessMimeType(image) should contain ("image/jpeg")
    }
  }

  it("should detect png mime types for images") {
    for (fileName <- List("basn0g08.png", "basn2c08.png", "basn3p08.png", "basn6a08.png")) {
      val image = fileAt("schaik.com_pngsuite/" + fileName)
      MimeTypeDetection.guessMimeType(image) should contain ("image/png")
    }
  }

  it("should detect tiff mime types for images") {
    for (fileName <- List("flag.tif")) {
      val image = fileAt(fileName)
      MimeTypeDetection.guessMimeType(image) should contain ("image/tiff")
    }
  }

}
