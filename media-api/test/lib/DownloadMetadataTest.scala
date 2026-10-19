package lib

import com.gu.mediaservice.model.{Image, ImageMetadata}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DownloadMetadataTest extends AnyFunSpec with Matchers {

  private val fullMetadata = ImageMetadata(
    copyright = Some("© ACME 2026"),
    credit = Some("ACME Picture Desk"),
    suppliersReference = Some("REF-123")
  )

  private def imageWith(metadata: ImageMetadata, id: String = "abc123"): Image =
    TestUtils.img.copy(id = id, metadata = metadata)

  describe("retainedTags") {
    it("records the Grid id in XMP-xmpMM:OriginalDocumentID, namespaced with a grid:docid: prefix") {
      DownloadMetadata.retainedTags(imageWith(fullMetadata, id = "deadbeef")) should contain(
        "XMP-xmpMM:OriginalDocumentID" -> "grid:docid:deadbeef"
      )
    }

    it("writes an id a reader can recover by stripping the prefix") {
      val id = "dd1b8b30c9e34c7f9c1f0a4e5b6d7e8f90123456"
      val value = DownloadMetadata.retainedTags(imageWith(fullMetadata, id = id))("XMP-xmpMM:OriginalDocumentID")

      value should startWith("grid:docid:")
      value.stripPrefix("grid:docid:") shouldBe id
    }

    it("records the Grid id even when there is no metadata to retain") {
      DownloadMetadata.retainedTags(imageWith(ImageMetadata())) shouldBe Map(
        "XMP-xmpMM:OriginalDocumentID" -> "grid:docid:abc123"
      )
    }

    it("writes copyright through the MWG composite rather than the individual EXIF/IPTC/XMP tags") {
      val tags = DownloadMetadata.retainedTags(imageWith(fullMetadata))

      tags should contain("MWG:Copyright" -> "© ACME 2026")
      // The whole point of the MWG composite is that ExifTool fans these out for us.
      tags.keys should contain noneOf("EXIF:Copyright", "IPTC:CopyrightNotice", "XMP-dc:Rights")
    }

    it("writes credit and suppliers reference to both their IPTC and XMP homes, as MWG has no composite for either") {
      val tags = DownloadMetadata.retainedTags(imageWith(fullMetadata))

      tags should contain("IPTC:Credit" -> "ACME Picture Desk")
      tags should contain("XMP-photoshop:Credit" -> "ACME Picture Desk")
      tags should contain("IPTC:OriginalTransmissionReference" -> "REF-123")
      tags should contain("XMP-photoshop:TransmissionReference" -> "REF-123")
    }

    it("retains only the fields the cropper retains, so downloads and full-frame crops stay consistent") {
      DownloadMetadata.retainedTags(imageWith(fullMetadata)).keySet shouldBe Set(
        "MWG:Copyright",
        "IPTC:Credit",
        "XMP-photoshop:Credit",
        "IPTC:OriginalTransmissionReference",
        "XMP-photoshop:TransmissionReference",
        "XMP-xmpMM:OriginalDocumentID"
      )
    }

    it("omits fields Grid holds no value for, rather than writing them empty") {
      val tags = DownloadMetadata.retainedTags(imageWith(ImageMetadata(copyright = Some("© ACME 2026"))))

      tags.keySet shouldBe Set("MWG:Copyright", "XMP-xmpMM:OriginalDocumentID")
    }

    it("treats blank and whitespace-only values as absent") {
      val tags = DownloadMetadata.retainedTags(
        imageWith(ImageMetadata(copyright = Some(""), credit = Some("   "), suppliersReference = Some("REF-123")))
      )

      tags.keySet shouldBe Set(
        "IPTC:OriginalTransmissionReference",
        "XMP-photoshop:TransmissionReference",
        "XMP-xmpMM:OriginalDocumentID"
      )
    }

    it("does not retain the byline, which is dropped to match the cropper's retained set") {
      val tags = DownloadMetadata.retainedTags(
        imageWith(fullMetadata.copy(byline = Some("Jane Doe")))
      )

      tags.values should not contain "Jane Doe"
    }
  }
}
