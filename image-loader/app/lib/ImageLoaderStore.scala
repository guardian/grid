package lib.storage

import lib.ImageLoaderConfig
import com.gu.mediaservice.lib
import com.amazonaws.HttpMethod
import com.amazonaws.services.s3.model.{AmazonS3Exception, GeneratePresignedUrlRequest, S3Object}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.Instance

import java.time.ZonedDateTime
import java.util.Date

class S3FileDoesNotExistException extends Exception()

class ImageLoaderStore(config: ImageLoaderConfig) extends lib.ImageIngestOperations(config.imageBucket, config.thumbnailBucket, config) with GridLogging {

  private def handleNotFound[T](key: String)(doWork: => T)(loggingIfNotFound: => Unit): T = {
    try {
      doWork
    } catch {
      case e: AmazonS3Exception if e.getStatusCode == 404 || e.getStatusCode == 403 => {
        logger.warn(s"AmazonS3Exception ${e.getStatusCode} for key '$key'")
        loggingIfNotFound
        throw new S3FileDoesNotExistException
      }
      case other: Throwable => throw other
    }
  }

  def getS3Object(key: String)(implicit logMarker: LogMarker): S3Object = handleNotFound(key) {
    val bucket = config.maybeIngestBucket.get
    logger.info(s"getS3Object $key from $bucket")
    client.getObject(bucket, key)
  } {
    logger.error(logMarker, s"Attempted to read $key from ingest bucket, but it does not exist.")
  }

  def generatePreSignedUploadUrl(filename: String, expiration: ZonedDateTime, uploadedBy: String, mediaId: String)(implicit instance: Instance): String = {
    val request = new GeneratePresignedUrlRequest(
      config.maybeIngestBucket.get, // bucket
      s"${instance.id}/$uploadedBy/$filename", // key
    )
      .withMethod(HttpMethod.PUT)
      .withExpiration(Date.from(expiration.toInstant));

    // sent by the client in manager.js
    request.putCustomRequestHeader("x-amz-meta-media-id", mediaId)

    client.generatePresignedUrl(request).toString
  }

  def moveObjectToFailedBucket(key: String)(implicit logMarker: LogMarker) = handleNotFound(key){
    client.copyObject(config.maybeIngestBucket.get, key, config.maybeFailBucket.get, key) // TODO Naked get - make optional
    deleteObjectFromIngestBucket(key)
  } {
    logger.warn(logMarker, s"Attempted to copy $key from ingest bucket to fail bucket, but it does not exist.")
  }

  def deleteObjectFromIngestBucket(key: String)(implicit logMarker: LogMarker) = handleNotFound(key) {
    client.deleteObject(config.maybeIngestBucket.get,key)
  } {
    logger.warn(logMarker, s"Attempted to delete $key from ingest bucket, but it does not exist.")
  }
}

