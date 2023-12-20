package lib.storage

import lib.ImageLoaderConfig
import com.gu.mediaservice.lib
import com.amazonaws.HttpMethod
import com.amazonaws.services.s3.model.{AmazonS3Exception, GeneratePresignedUrlRequest}

import java.time.ZonedDateTime
import java.util.Date

class ImageLoaderStore(config: ImageLoaderConfig) extends lib.ImageIngestOperations(config.imageBucket, config.thumbnailBucket, config) {

  def getS3Object(key: String) = client.getObject(config.maybeIngestBucket.get, key)

  def generatePreSignedUploadUrl(filename: String, expiration: ZonedDateTime, uploadedBy: String, mediaId: String): String = {
    val request = new GeneratePresignedUrlRequest(
      config.maybeIngestBucket.get, // bucket
      s"$uploadedBy/$filename", // key
    )
      .withMethod(HttpMethod.PUT)
      .withExpiration(Date.from(expiration.toInstant));

    // sent by the client in manager.js
    request.putCustomRequestHeader("x-amz-meta-media-id", mediaId)

    client.generatePresignedUrl(request).toString
  }

  def moveObjectToFailedBucket(key: String) = {
    try {
      client.copyObject(config.maybeIngestBucket.get, key, config.maybeFailBucket.get, key)
      deleteObjectFromIngestBucket(key)
    } catch {
      case e: AmazonS3Exception if e.getErrorCode == "AccessDenied" && !client.doesObjectExist(config.maybeIngestBucket.get, key) =>
        logger.warn(s"Attempted to copy $key from ingest bucket to fail bucket, but it does not exist.")
      case other: Throwable => throw other
    }
  }

  def deleteObjectFromIngestBucket(key: String) = try {
    client.deleteObject(config.maybeIngestBucket.get,key)
  } catch {
    case e: AmazonS3Exception if e.getErrorCode == "AccessDenied" && !client.doesObjectExist(config.maybeIngestBucket.get, key) =>
      logger.warn(s"Attempted to delete $key from ingest bucket, but it does not exist.")
    case other: Throwable => throw other
  }
}

