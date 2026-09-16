package test.lib.imaging

import com.gu.mediaservice.model.{Jpeg, Png, Tiff}
import lib.imaging.C2paDetector
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

import java.io.File

class C2paDetectorTest extends AnyFunSpec with Matchers {

  import test.lib.ResourceHelpers._

  describe("hasC2paManifest") {
    it("should detect a C2PA manifest in a signed JPEG") {
      C2paDetector.hasC2paManifest(fileAt("c2pa/c2pa-present.jpg"), Jpeg) shouldBe true
    }

    it("should not detect a C2PA manifest in an unsigned JPEG") {
      C2paDetector.hasC2paManifest(fileAt("c2pa/c2pa-absent.jpg"), Jpeg) shouldBe false
    }

    it("should not detect a C2PA manifest in a JPEG with no APP11/JUMBF segment at all") {
      C2paDetector.hasC2paManifest(fileAt("getty.jpg"), Jpeg) shouldBe false
    }

    it("should detect a C2PA manifest in a signed PNG") {
      C2paDetector.hasC2paManifest(fileAt("c2pa/c2pa-present.png"), Png) shouldBe true
    }

    it("should not detect a C2PA manifest in an unsigned PNG") {
      C2paDetector.hasC2paManifest(fileAt("c2pa/c2pa-absent.png"), Png) shouldBe false
    }

    it("should not detect a C2PA manifest in a PNG with no caBX chunk at all") {
      C2paDetector.hasC2paManifest(fileAt("IndexedColor.png"), Png) shouldBe false
    }

    it("should detect a C2PA manifest in a signed TIFF") {
      C2paDetector.hasC2paManifest(fileAt("c2pa/c2pa-present.tiff"), Tiff) shouldBe true
    }

    it("should not detect a C2PA manifest in an unsigned TIFF") {
      C2paDetector.hasC2paManifest(fileAt("c2pa/c2pa-absent.tiff"), Tiff) shouldBe false
    }

    it("should not detect a C2PA manifest in a TIFF with no private C2PA tag at all") {
      C2paDetector.hasC2paManifest(fileAt("flower.tif"), Tiff) shouldBe false
    }

    it("should gracefully return false, rather than throw, when the file doesn't match the given mime type") {
      // a PNG parsed as though it were a JPEG - the underlying metadata-extractor call will fail
      C2paDetector.hasC2paManifest(fileAt("c2pa/c2pa-present.png"), Jpeg) shouldBe false
    }

    it("should gracefully return false, rather than throw, when the file doesn't exist") {
      C2paDetector.hasC2paManifest(new File("/no/such/file.jpg"), Jpeg) shouldBe false
    }
  }
}
