package model

import java.io.File
import java.net.URI
import java.util.UUID

import com.gu.mediaservice.lib.aws.{S3Metadata, S3Object, S3ObjectMetadata}
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.{FileMetadata, Image, Jpeg, MimeType, Png, Tiff, UploadInfo}
import lib.imaging.MimeTypeDetection
import org.joda.time.DateTime
import org.scalatest.mockito.MockitoSugar
import org.scalatest.{AsyncFunSuite, Matchers}
import test.lib.ResourceHelpers

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

class ImageUploadTest extends AsyncFunSuite with Matchers with MockitoSugar {
  implicit val ec = ExecutionContext.Implicits.global

  class MockLogMarker extends LogMarker {
    override def markerContents: Map[String, Any] = Map()
  }

  implicit val logMarker = new MockLogMarker();
    // For mime type info, see https://github.com/guardian/grid/pull/2568
    val mockConfig = ImageUploadOpsCfg(new File("/tmp"), 256, 85d, List(Tiff), "img-bucket", "thumb-bucket")

  /**
    * @todo: I flailed about until I found a path that worked, but
    *        what arcane magic System.getProperty relies upon, and exactly
    *        _how_ it will break in CI, I do not know
    */
  val imageOps: ImageOperations = new ImageOperations(System.getProperty("user.dir"))

  def imageUpload(
    fileName: String,
    expectedOriginalMimeType: MimeType,
    expectedThumbMimeType: MimeType,
    expectedOptimisedMimeType: Option[MimeType] = None) = {
    val willCreateOptimisedPNG = expectedOptimisedMimeType.isDefined

    val uuid = UUID.randomUUID()
    val randomId = UUID.randomUUID().toString + fileName

    val mockS3Meta = S3Metadata(Map.empty, S3ObjectMetadata(None, None, None))
    val mockS3Object = S3Object(new URI("innernets.com"), 12345, mockS3Meta)

    def storeOrProjectOriginalFile: UploadRequest => Future[S3Object] = {
      a => {
        Future.successful(
          mockS3Object
            .copy(size = a.tempFile.length())
            .copy(metadata = mockS3Object.metadata
              .copy(objectMetadata = mockS3Object.metadata.objectMetadata
                .copy(contentType = a.mimeType))))
      }
    }

    def storeOrProjectThumbFile: (UploadRequest, File) => Future[S3Object] = {
      (a, b) => {
        Future.successful(
          mockS3Object
            .copy(size = b.length())
            .copy(metadata = mockS3Object.metadata
              .copy(objectMetadata = mockS3Object.metadata.objectMetadata
                .copy(contentType = a.mimeType)))
        )
      }
    }

    def storeOrProjectOptimisedPNG: (UploadRequest, File) => Future[S3Object] = {
      (a, b) => {
        if (a.mimeType.contains(Jpeg)) fail("We should not create optimised jpg")
        Future.successful(
          mockS3Object
            .copy(size = b.length())
            .copy(metadata = mockS3Object.metadata
              .copy(objectMetadata = mockS3Object.metadata.objectMetadata
                .copy(contentType = a.mimeType)))
        )
      }
    }

    val mockDependencies = ImageUploadOpsDependencies(
      mockConfig,
      imageOps,
      storeOrProjectOriginalFile,
      storeOrProjectThumbFile,
      storeOrProjectOptimisedPNG
    )

    val tempFile = ResourceHelpers.fileAt(fileName)
    val ul = UploadInfo(None)

    val uploadRequest = UploadRequest(
      uuid,
      randomId,
      tempFile,
      MimeTypeDetection.guessMimeType(tempFile).right.toOption,
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
      OptimisedPngQuantOps,
      uploadRequest,
      mockDependencies,
      FileMetadata()
    )

    // Assertions; Failure will auto-fail
    futureImage.map(i => {
      assert(i.id == randomId, "Correct id comes back")
      assert(i.source.mimeType.contains(expectedOriginalMimeType), "Should have the correct mime type")
      assert(i.thumbnail.isDefined, "Should always create a thumbnail")
      assert(i.optimisedPng.isDefined == willCreateOptimisedPNG, "Should or should not create an optimised png")
      assert(i.thumbnail.get.mimeType.get == expectedThumbMimeType, "Should have correct thumb mime type")
      assert(i.optimisedPng.flatMap(p => p.mimeType) == expectedOptimisedMimeType, "Should have correct optimised mime type")
    })
  }

  // TODO check somehow that the temp files have all been cleared up.

  test("rubbish") {
    imageUpload("rubbish.jpg", Jpeg, Jpeg)
  }
  test("lighthouse") {
    imageUpload("lighthouse.tif", Tiff, Png, Some(Png))
  }
  test("tiff_8bpc_layered_withTransparency") {
    imageUpload("tiff_8bpc_layered_withTransparency.tif", Tiff, Png, Some(Png))
  }
  test("tiff_8bpc_flat") {
    imageUpload("tiff_8bpc_flat.tif", Tiff, Png, Some(Png))
  }
  test("IndexedColor") {
    imageUpload("IndexedColor.png", Png, Png)
  }
  test("bgan6a16_TrueColorWithAlpha_16bit") {
    imageUpload("bgan6a16_TrueColorWithAlpha_16bit.png", Png, Png, Some(Png))
  }
  test("basn2c16_TrueColor_16bit") {
    imageUpload("basn2c16_TrueColor_16bit.png", Png, Png, Some(Png))
  }
}

// todo add to tests - tiff with layers, but not true colour so does not need optimising. MK to provide
