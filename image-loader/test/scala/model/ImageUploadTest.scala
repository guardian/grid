package model

import java.io.File
import java.util.UUID

import com.gu.mediaservice.lib.aws.S3Object
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.{FileMetadata, UploadInfo}
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.when
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.mockito.MockitoSugar
import org.scalatest.{AsyncFlatSpec, AsyncFunSuite, FunSuite, FunSuiteLike, Matchers}

import scala.concurrent.{ExecutionContext, Future}
import ExecutionContext.Implicits.global

class ImageUploadTest extends AsyncFunSuite with Matchers with MockitoSugar {
  test("do something") {
    class MockLogMarker extends LogMarker {
      override def markerContents: Map[String, Any] = ???
    }
    implicit val logMarker = new MockLogMarker();

    val mockConfig = mock[ImageUploadOpsCfg]

    val mockStoreOrProjectOriginalFileResult = mock[S3Object]

    val mockS3Object = mock[S3Object]
    def storeOrProjectOriginalFile: UploadRequest => Future[S3Object] = {
      _ => Future.successful(mockS3Object)
    }
    def storeOrProjectThumbFile: (UploadRequest, File) => Future[S3Object] = {
      (_, _) => Future.successful(mockS3Object)
    }
    def storeOrProjectOptimisedPNG: (UploadRequest, File) => Future[S3Object] = {
      (_, _) => Future.successful(mockS3Object)
    }
    val imageOps: ImageOperations = new ImageOperations("")

    val mockDependencies = ImageUploadOpsDependencies(
      mockConfig,
      imageOps,
      storeOrProjectOriginalFile,
      storeOrProjectThumbFile,
      storeOrProjectOptimisedPNG)

    val mockOptimisedPngOps = mock[OptimisedPngOps]

    val uuid = UUID.randomUUID()
    val tempFile = java.io.File.createTempFile("aaaa", "b")
    val ul = UploadInfo(None)
    val uploadRequest = new UploadRequest(
                              uuid,
                              "imageId": String,
                              tempFile, //: File,
                              None, //mimeType: Option[MimeType],
                              DateTime.now(), //uploadTime: DateTime,
                              "uploadedBy", //: String,
                              Map(), // identifiers: Map[String, String],
                              ul //uploadInfo: UploadInfo
                            )

    val fileMetadata = FileMetadata()

    val futureImage = Uploader.uploadAndStoreImage(mockConfig,
      mockDependencies.storeOrProjectOriginalFile,
      mockDependencies.storeOrProjectThumbFile,
      mockDependencies.storeOrProjectOptimisedPNG,
      mockOptimisedPngOps,
      uploadRequest, //originalUploadRequest: UploadRequest,
      mockDependencies, //deps: ImageUploadOpsDependencies,
      fileMetadata)(global, logMarker) //fileMetadata: FileMetadata)

    futureImage.map({_ => fail()})(global)

  }
}

