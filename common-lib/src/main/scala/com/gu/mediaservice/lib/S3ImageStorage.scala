package com.gu.mediaservice.lib

import java.io.File
import scala.concurrent.Future
import com.amazonaws.auth.AWSCredentials
import com.gu.mediaservice.lib.aws.S3
import org.slf4j.LoggerFactory


class S3ImageStorage(credentials: AWSCredentials) extends S3(credentials) with ImageStorage {
  private val log = LoggerFactory.getLogger(getClass)

  def storeImage(bucket: String, id: String, file: File, mimeType: Option[String], meta: Map[String, String] = Map.empty) =
    store(bucket, id, file, mimeType, meta, Some(cacheForever))

  def deleteImage(bucket: String, id: String) = Future {
    client.deleteObject(bucket, id)
    log.info(s"Deleted image $id from bucket $bucket")
  }
}
