package com.gu.mediaservice.lib

import java.io.File
import scala.concurrent.Future
import com.amazonaws.auth.AWSCredentials
import com.gu.mediaservice.lib.aws.S3
import org.slf4j.LoggerFactory


class S3ImageStorage(imageBucket: String, thumbnailBucket: String, credentials: AWSCredentials)
  extends S3(credentials) with ImageStorage {

  private val log = LoggerFactory.getLogger(getClass)

  def storeImage(id: String, file: File, meta: Map[String, String] = Map.empty) =
    store(imageBucket, id, file, None, meta)

  def storeThumbnail(id: String, file: File) = store(thumbnailBucket, id, file)

  def deleteImage(id: String) = Future {
    client.deleteObject(imageBucket, id)
    log.info(s"Deleted image $id from bucket $imageBucket")
  }

  def deleteThumbnail(id: String) = Future {
    client.deleteObject(thumbnailBucket, id)
  }

}
