package lib

import org.scalatest.BeforeAndAfterEach
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

import java.nio.file.attribute.FileTime
import java.nio.file.{Files, Path}
import java.time.Instant
import java.time.temporal.ChronoUnit
import scala.concurrent.duration._

class DownloadTempFilesTest extends AnyFunSpec with Matchers with BeforeAndAfterEach {

  private var root: Path = _
  private def directory = root.resolve("grid-downloads")

  override def beforeEach(): Unit = root = Files.createTempDirectory("download-temp-files-test-")

  override def afterEach(): Unit =
    Files.walk(root).sorted(java.util.Comparator.reverseOrder[Path]()).forEach(Files.delete(_))

  private def tempFiles(minFreeBytes: Long = 0) = new DownloadTempFiles(directory, minFreeBytes, maxAge = 60.minutes)

  private def fileAged(tempFiles: DownloadTempFiles, minutes: Long, now: Instant): Path = {
    val path = tempFiles.create()
    Files.setLastModifiedTime(path, FileTime.from(now.minus(minutes, ChronoUnit.MINUTES)))
    path
  }

  describe("sweep") {
    it("deletes files older than the max age, including ones ExifTool left behind, and keeps newer ones") {
      val files = tempFiles()
      val now = Instant.now()
      val stale = fileAged(files, minutes = 61, now)
      val staleExiftoolWorkingFile = Files.createFile(directory.resolve(s"${stale.getFileName}_exiftool_tmp"))
      Files.setLastModifiedTime(staleExiftoolWorkingFile, FileTime.from(now.minus(61, ChronoUnit.MINUTES)))
      val inProgress = fileAged(files, minutes = 59, now)

      files.sweep(now) shouldBe 2

      Files.exists(stale) shouldBe false
      Files.exists(staleExiftoolWorkingFile) shouldBe false
      Files.exists(inProgress) shouldBe true
    }

    it("creates the directory if it does not exist, e.g. because it has been removed") {
      val files = tempFiles()
      Files.exists(directory) shouldBe false

      files.sweep() shouldBe 0
      Files.isDirectory(directory) shouldBe true
    }
  }

  describe("hasSpaceFor") {
    def usableSpace = Files.getFileStore(root).getUsableSpace

    it("allows a download that leaves the minimum free space") {
      tempFiles(minFreeBytes = 1024).hasSpaceFor(1024) shouldBe true
    }

    it("refuses a download that would leave less than the minimum free space") {
      tempFiles(minFreeBytes = usableSpace).hasSpaceFor(1024 * 1024 * 1024) shouldBe false
    }

    it("allows for ExifTool's working copy, needing twice the image size") {
      tempFiles().hasSpaceFor(usableSpace / 2 + 1024 * 1024 * 1024) shouldBe false
    }
  }
}
