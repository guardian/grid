package com.gu.mediaservice.lib

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{never, verify, when}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{DeleteObjectRequest, HeadObjectRequest, HeadObjectResponse, NoSuchKeyException}

class S3ImageStorageTest extends AnyFunSpec with Matchers with ScalaFutures with MockitoSugar {
  private implicit val marker: LogMarker = MarkerMap()

  private def storageWith(s3Client: S3Client) = new S3ImageStorage(mock[CommonConfig]) {
    override lazy val client: S3Client = s3Client
  }

  describe("deleteVersionedImage") {
    it("succeeds without calling deleteObject when the object is already absent") {
      val s3Client = mock[S3Client]
      when(s3Client.headObject(any[HeadObjectRequest])).thenThrow(NoSuchKeyException.builder().build())

      storageWith(s3Client).deleteVersionedImage("bucket", "missing-id").futureValue

      verify(s3Client, never()).deleteObject(any[DeleteObjectRequest])
    }

    it("deletes the specific version returned by headObject") {
      val s3Client = mock[S3Client]
      when(s3Client.headObject(any[HeadObjectRequest]))
        .thenReturn(HeadObjectResponse.builder().versionId("v1").build())

      storageWith(s3Client).deleteVersionedImage("bucket", "present-id").futureValue

      verify(s3Client).deleteObject(DeleteObjectRequest.builder().bucket("bucket").key("present-id").versionId("v1").build())
    }
  }
}
