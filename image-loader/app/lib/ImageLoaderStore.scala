package lib.storage

import lib.ImageLoaderConfig
import com.gu.mediaservice.lib
import com.amazonaws.HttpMethod
import com.amazonaws.services.s3.model.GeneratePresignedUrlRequest
import com.gu.mediaservice.lib.ImageStorageProps

import java.time.ZonedDateTime
import java.util.Date

class ImageLoaderStore(config: ImageLoaderConfig) extends lib.ImageIngestOperations(config.imageBucket, config.thumbnailBucket, config) {

  def getS3Object(key: String) = client.getObject(config.maybeIngestBucket.get, key)

  def generatePreSignedUploadUrl(filename: String, expiration: ZonedDateTime, uploadedBy: String, originalFilename: String): String = {
    val request = new GeneratePresignedUrlRequest(
      config.maybeIngestBucket.get, // bucket
      s"$uploadedBy/$filename", // key
    )
      .withMethod(HttpMethod.PUT)
      .withExpiration(Date.from(expiration.toInstant));

    // sent by the client in manager.js
    request.putCustomRequestHeader(s"x-amz-meta-${ImageStorageProps.filenameMetadataKey}", originalFilename)

    client.generatePresignedUrl(request).toString
  }

  def moveObjectToFailedBucket(key: String) = {
    val copyObjectResult = client.copyObject(config.maybeIngestBucket.get, key, config.maybeFailBucket.get, key)
    println(copyObjectResult)
    deleteObjectFromIngestBucket(key)
  }

  def deleteObjectFromIngestBucket(key: String) = {
    client.deleteObject(config.maybeIngestBucket.get,key)
  }
}

