package com.gu.mediaservice.lib.imaging.im4jwrapper

import org.scalatest.BeforeAndAfterAll
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.time.{Millis, Seconds, Span}

import java.awt.color.{ColorSpace, ICC_Profile}
import java.awt.image.BufferedImage
import java.io.File
import java.nio.file.{Files, Path}
import javax.imageio.ImageIO
import scala.sys.process._

class ExifToolTest extends AnyFunSpec with Matchers with ScalaFutures with BeforeAndAfterAll {

  // Each assertion shells out to exiftool, which is a Perl script and slow to start.
  implicit override val patienceConfig: PatienceConfig =
    PatienceConfig(timeout = Span(30, Seconds), interval = Span(100, Millis))

  private var tempDir: Path = _

  override def beforeAll(): Unit = tempDir = Files.createTempDirectory("exiftool-test-")

  override def afterAll(): Unit = {
    Files.walk(tempDir).sorted(java.util.Comparator.reverseOrder[Path]()).forEach(Files.delete(_))
  }

  private val copyright = "© ACME 2026"
  private val credit = "ACME Picture Desk"
  private val imageId = "dd1b8b30c9e34c7f9c1f0a4e5b6d7e8f90123456"
  // Mirrors the `grid:docid:` prefix DownloadMetadata applies - the colons make this worth
  // exercising against the real binary, as they also separate a tag name from its value.
  private val documentId = s"grid:docid:$imageId"

  /** The tags a download retains - mirrors `DownloadMetadata.retainedTags`. */
  private val retainedTags = Map(
    "MWG:Copyright" -> copyright,
    "IPTC:Credit" -> credit,
    "XMP-photoshop:Credit" -> credit,
    "XMP-xmpMM:OriginalDocumentID" -> documentId
  )

  /** A small JPEG carrying an ICC profile, an EXIF orientation and a spread of personal data. */
  private def fixture(name: String): File = {
    val image = new BufferedImage(64, 48, BufferedImage.TYPE_INT_RGB)
    for (y <- 0 until 48; x <- 0 until 64) image.setRGB(x, y, ((x * 4) << 16) | ((y * 5) << 8) | 128)

    val file = tempDir.resolve(s"$name.jpg").toFile
    ImageIO.write(image, "jpeg", file)

    val profile = tempDir.resolve(s"$name.icc")
    Files.write(profile, ICC_Profile.getInstance(ColorSpace.CS_sRGB).getData)

    exiftool(
      s"-icc_profile<=${profile.toAbsolutePath}",
      "-EXIF:Orientation#=6",
      "-GPSLatitude=51.5", "-GPSLatitudeRef=N",
      "-XMP-iptcExt:PersonInImage=Sensitive Person",
      "-SerialNumber=CAM-999",
      "-IPTC:Caption-Abstract=private caption",
      "-EXIF:DateTimeOriginal=2020:01:01 10:00:00",
      "-Copyright=ORIGINAL copyright, since replaced in Grid",
      "-overwrite_original",
      file.getAbsolutePath
    )
    file
  }

  private def exiftool(args: String*): String = (Seq("exiftool") ++ args).!!

  private def tag(file: File, name: String): Option[String] =
    Option(exiftool("-s", "-s", "-s", s"-$name", file.getAbsolutePath).trim).filter(_.nonEmpty)

  private def pixels(file: File): Seq[Int] = {
    val image = ImageIO.read(file)
    for (y <- 0 until image.getHeight; x <- 0 until image.getWidth) yield image.getRGB(x, y)
  }

  private def strippedFixture(name: String, tags: Map[String, String] = retainedTags): File = {
    val file = fixture(name)
    whenReady(ExifTool.stripMetadataRetaining(file, tags))(_ => ())
    file
  }

  describe("stripMetadataRetaining") {
    it("removes personal data embedded in the source image") {
      val file = strippedFixture("removes-pii")

      tag(file, "GPSLatitude") shouldBe None
      tag(file, "PersonInImage") shouldBe None
      tag(file, "SerialNumber") shouldBe None
      tag(file, "Caption-Abstract") shouldBe None
      tag(file, "DateTimeOriginal") shouldBe None
    }

    it("removes anything not explicitly retained, so new metadata is dropped by default") {
      val file = strippedFixture("allowlist")

      // Everything left should be either a retained value, the ICC profile, orientation, or the
      // structural IFD0/IPTC bookkeeping ExifTool writes to form a valid record.
      val remaining = exiftool(
        "-a", "-u", "-G1", "-s",
        "--System:all", "--File:all", "--ExifTool:all", "--Composite:all",
        "--ICC_Profile:all", "--ICC-header:all", "--ICC-view:all", "--ICC-meas:all",
        file.getAbsolutePath
      )
      val unexpected = remaining.linesIterator.map(_.trim).filter(_.nonEmpty).filterNot { line =>
        line.contains(copyright) || line.contains(credit) || line.contains(imageId) ||
          line.contains("Orientation") || line.contains("Resolution") ||
          line.contains("YCbCrPositioning") || line.contains("ApplicationRecordVersion") ||
          line.contains("IPTCDigest") || line.contains("XMPToolkit")
      }.toList

      withClue(s"unexpected metadata survived the strip:\n${unexpected.mkString("\n")}\n") {
        unexpected shouldBe empty
      }
    }

    it("retains the ICC profile, without which colours would render incorrectly") {
      tag(strippedFixture("keeps-icc"), "ProfileDescription") shouldBe defined
    }

    it("retains the EXIF orientation, without which the image would render rotated") {
      tag(strippedFixture("keeps-orientation"), "Orientation") shouldBe Some("Rotate 90 CW")
    }

    it("writes the supplied tags, overwriting values the file was uploaded with") {
      val file = strippedFixture("writes-tags")

      tag(file, "EXIF:Copyright") shouldBe Some(copyright)
      tag(file, "IPTC:Credit") shouldBe Some(credit)
      // Colons in the value must survive intact, not be parsed as part of the tag name.
      tag(file, "XMP-xmpMM:OriginalDocumentID") shouldBe Some(documentId)
    }

    it("fans MWG:Copyright out across the EXIF, IPTC and XMP copyright tags") {
      val file = strippedFixture("mwg-fanout")

      tag(file, "EXIF:Copyright") shouldBe Some(copyright)
      tag(file, "XMP-dc:Rights") shouldBe Some(copyright)
      // MWG only writes the IPTC record when one is present, which `IPTC:Credit` ensures here.
      tag(file, "IPTC:CopyrightNotice") shouldBe Some(copyright)
    }

    it("does not invent tags that were not supplied") {
      val file = strippedFixture("no-extra-tags", Map("MWG:Copyright" -> copyright))

      tag(file, "IPTC:Credit") shouldBe None
      tag(file, "XMP-photoshop:Credit") shouldBe None
      tag(file, "XMP-xmpMM:OriginalDocumentID") shouldBe None
    }

    it("leaves the compressed pixel data untouched, unlike a re-encoding proxy") {
      val original = fixture("lossless")
      val before = pixels(original)

      whenReady(ExifTool.stripMetadataRetaining(original, retainedTags))(_ => ())

      pixels(original) shouldBe before
    }
  }
}
