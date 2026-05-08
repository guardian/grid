package lib.storage

import com.amazonaws.HttpMethod
import com.amazonaws.services.s3.model.GeneratePresignedUrlRequest
import lib.ImageLoaderConfig
import com.gu.mediaservice.lib
import com.gu.mediaservice.lib.logging.LogMarker
import software.amazon.awssdk.core.ResponseInputStream
import software.amazon.awssdk.services.s3.model.{DeleteObjectResponse, GetObjectResponse, NoSuchKeyException, PutObjectRequest}
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest

import java.io.File
import java.time.{Duration, Instant, ZonedDateTime}
import java.util.Date
import scala.jdk.CollectionConverters._

class S3FileDoesNotExistException extends Exception()

class ImageLoaderStore(config: ImageLoaderConfig) extends lib.ImageIngestOperations(config.imageBucket, config.thumbnailBucket, config) {

  private def handleNotFound[T](doWork: => T)(loggingIfNotFound: => Unit): T = {
    try {
      doWork
    } catch {
      case _: NoSuchKeyException =>
        loggingIfNotFound
        throw new S3FileDoesNotExistException
      case other: Throwable => throw other
    }
  }

  def getS3Object(key: String)(implicit logMarker: LogMarker): ResponseInputStream[GetObjectResponse] = handleNotFound {
    getObject(config.maybeIngestBucket.get, key)
  } {
    logger.error(logMarker, s"Attempted to read $key from ingest bucket, but it does not exist.")
  }

  def queueS3Object(uploader: String, filename: String, s3Meta: Map[String, String], file: File)(implicit logMarker: LogMarker) = {
    store(
        config.maybeIngestBucket.get,
        s"$uploader/$filename",
        file,
        mimeType = None, // we don't care as this is just the queue bucket
        meta = s3Meta,
      )
  }

  def generatePreSignedUploadUrl(
    filename: String,
    expiration: ZonedDateTime,
    uploadedBy: String,
    mediaId: String
  ): String = {
    val putObjectRequest = PutObjectRequest.builder()
      .bucket(config.maybeBucketForUIUploads.get)
      .key(s"$uploadedBy/$filename")
      .metadata(Map("media-id" -> mediaId).asJava)
      .build()
    val presignRequest = PutObjectPresignRequest.builder()
      .putObjectRequest(putObjectRequest)
      .signatureDuration(Duration.between(Instant.now, expiration))
      .build()

    presigner.presignPutObject(presignRequest).url().toExternalForm
  }

  def moveObjectToFailedBucket(key: String)(implicit logMarker: LogMarker): DeleteObjectResponse = handleNotFound {
    copyObject(config.maybeIngestBucket.get, key, config.maybeFailBucket.get, key)
    deleteObjectFromIngestBucket(key)
  } {
    logger.warn(logMarker, s"Attempted to copy $key from ingest bucket to fail bucket, but it does not exist.")
  }

  def deleteObjectFromIngestBucket(key: String)(implicit logMarker: LogMarker): DeleteObjectResponse = handleNotFound {
    deleteObject(config.maybeIngestBucket.get,key)
  } {
    logger.warn(logMarker, s"Attempted to delete $key from ingest bucket, but it does not exist.")
  }
}

