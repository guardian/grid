package model

import java.io.File
import java.net.URI
import java.util.UUID

import com.gu.mediaservice.lib.aws.{S3Metadata, S3Object, S3ObjectMetadata}
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.{FileMetadata, UploadInfo}
import org.joda.time.DateTime
import org.scalatest.mockito.MockitoSugar
import org.scalatest.{AsyncFunSuite, Matchers}
import test.lib.ResourceHelpers

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

class ImageUploadTest extends AsyncFunSuite with Matchers with MockitoSugar {
  implicit val ec = ExecutionContext.Implicits.global
  class MockLogMarker extends LogMarker {
    override def markerContents: Map[String, Any] = ???
  }
  implicit val logMarker = new MockLogMarker();
  val mockConfig = ImageUploadOpsCfg(new File("/tmp"), 256, 85d, Nil, "img-bucket", "thumb-bucket")

  /**
    * @todo: I flailed about until I found a path that worked, but
    * what arcane magic System.getProperty relies upon, and exactly
    * _how_ it will break in CI, I do not know
    */
  val imageOps: ImageOperations = new ImageOperations(System.getProperty("user.dir"))

  val mockOptimisedPngOps = mock[OptimisedPngOps]

  test("do something") {
    val imageFileName = "rubbish.jpg"
    val uuid = UUID.randomUUID()

    val mockS3Meta = S3Metadata(Map.empty, S3ObjectMetadata(None, None, None))
    val mockS3Object = S3Object(new URI("innernets.com"), 12345, mockS3Meta)

    def storeOrProjectOriginalFile: UploadRequest => Future[S3Object] = {
      _ => Future.successful(mockS3Object)
    }
    def storeOrProjectThumbFile: (UploadRequest, File) => Future[S3Object] = {
      (_, _) => Future.successful(mockS3Object)
    }
    def storeOrProjectOptimisedPNG: (UploadRequest, File) => Future[S3Object] = {
      (_, _) => Future.successful(mockS3Object)
    }

    val mockDependencies = ImageUploadOpsDependencies(
      mockConfig,
      imageOps,
      storeOrProjectOriginalFile,
      storeOrProjectThumbFile,
      storeOrProjectOptimisedPNG
    )

    val tempFile = ResourceHelpers.fileAt(imageFileName)
    val ul = UploadInfo(None)
    val uploadRequest = UploadRequest(
      uuid,
      "imageId",
      tempFile,
      None,
      DateTime.now(),
      "uploadedBy",
      Map(),
      ul
    )

    val futureImage = Uploader.uploadAndStoreImage(
      mockConfig,
      mockDependencies.storeOrProjectOriginalFile,
      mockDependencies.storeOrProjectThumbFile,
      mockDependencies.storeOrProjectOptimisedPNG,
      mockOptimisedPngOps,
      uploadRequest,
      mockDependencies,
      FileMetadata()
    )

    futureImage transformWith {
      case Success(_) =>
        // Assertions or fails
        fail("Do summat 'ere")
      case Failure(e) =>
        // Assertions or fail
        e.getMessage shouldBe "gnar"
    }
  }
}

