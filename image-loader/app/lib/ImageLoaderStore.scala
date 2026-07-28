package lib.storage

import software.amazon.awssdk.services.s3.model.{CopyObjectRequest, DeleteObjectRequest, GetObjectRequest, GetObjectResponse, PutObjectRequest, S3Exception}

import java.time.Duration
import scala.jdk.CollectionConverters.MapHasAsJava
import software.amazon.awssdk.core.ResponseInputStream
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest
import lib.ImageLoaderConfig
import com.gu.mediaservice.lib
import com.gu.mediaservice.lib.logging.LogMarker

import java.io.File

class S3FileDoesNotExistException extends Exception()

class ImageLoaderStore(config: ImageLoaderConfig) extends lib.ImageIngestOperations(config.imageBucket, config.thumbnailBucket, config) {

  private def handleNotFound[T](key: String)(doWork: => T)(loggingIfNotFound: => Unit): T = {
    try {
      doWork
    } catch {
      case e: S3Exception if e.statusCode() == 404 || e.statusCode() == 403 =>
        loggingIfNotFound
        throw new S3FileDoesNotExistException
      case other: Throwable => throw other
    }
  }

  def getS3Object(key: String)(implicit logMarker: LogMarker): ResponseInputStream[GetObjectResponse] = handleNotFound(key) {
      clientV2.getObject(
        GetObjectRequest.builder().bucket(config.maybeIngestBucket.get).key(key).build())
  } {
    logger.error(logMarker, s"Attempted to read $key from ingest bucket, but it does not exist.")
  }

  def queueS3Object(uploader: String, filename: String, s3Meta: Map[String, String], file: File)(implicit logMarker: LogMarker) = {
    storeV2(
        config.maybeIngestBucket.get,
        s"$uploader/$filename",
        file,
        mimeType = None, // we don't care as this is just the queue bucket
        meta = s3Meta,
      )
  }
  def generatePreSignedUploadUrl(filename: String, duration: Duration, uploadedBy: String, mediaId: String): String = {

    val putObjectRequest = PutObjectRequest.builder()
      .bucket(config.maybeBucketForUIUploads.get).key(s"$uploadedBy/$filename").metadata(Map(
        "media-id" -> mediaId).asJava)
      .build()
    val putObjectPresignRequest =
      PutObjectPresignRequest.builder()
        .putObjectRequest(putObjectRequest)
        .signatureDuration(duration)
        .build();

    val req = presigner.presignPutObject(putObjectPresignRequest)
    req.url().toExternalForm
  }

  def moveObjectToFailedBucket(key: String)(implicit logMarker: LogMarker) = handleNotFound(key){
    clientV2.copyObject(
      CopyObjectRequest.builder()
        .sourceBucket(config.maybeIngestBucket.get)
        .sourceKey(key)
        .destinationBucket(config.maybeFailBucket.get)
        .destinationKey(key)
        .build()
    )
    deleteObjectFromIngestBucket(key)
  } {
    logger.warn(logMarker, s"Attempted to copy $key from ingest bucket to fail bucket, but it does not exist.")
  }

  def deleteObjectFromIngestBucket(key: String)(implicit logMarker: LogMarker) = handleNotFound(key) {
    clientV2.deleteObject(
      DeleteObjectRequest.builder().bucket(config.maybeIngestBucket.get).key(key).build())
    ()
  } {
    logger.warn(logMarker, s"Attempted to delete $key from ingest bucket, but it does not exist.")
  }
}

