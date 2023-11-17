package lib.storage

import lib.ImageLoaderConfig
import com.gu.mediaservice.lib
import _root_.lib.DigestedFile
import com.amazonaws.HttpMethod
import java.time.ZonedDateTime
import java.util.Date

class ImageLoaderStore(config: ImageLoaderConfig) extends lib.ImageIngestOperations(config.imageBucket, config.thumbnailBucket, config) {

  def addFileToIngestBucket(digestedFile:DigestedFile) = {
    client.putObject(config.ingestBucket, digestedFile.digest, digestedFile.file)
  }

  def generatePreSignedUploadUrl(filename: String, expiration: ZonedDateTime, uploadedBy: String): String = {
    client.generatePresignedUrl(
      config.ingestBucket, // bucket
      s"$uploadedBy/$filename", // key
      Date.from(expiration.toInstant), // expiration
      HttpMethod.PUT
    ).toString
  }

}

