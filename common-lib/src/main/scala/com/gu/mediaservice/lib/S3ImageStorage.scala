package com.gu.mediaservice.lib

import java.io.File
import scala.concurrent.Future
import com.amazonaws.auth.AWSCredentials
import com.gu.mediaservice.lib.aws.S3
import org.slf4j.LoggerFactory

import scala.concurrent.duration._
import scala.language.postfixOps

class S3ImageStorage(imageBucket: String, thumbnailBucket: String, credentials: AWSCredentials)
  extends S3(credentials) with ImageStorage {

  private val log = LoggerFactory.getLogger(getClass)

  // Images can be cached "forever" as they never should change
  val cacheDuration = 365 days
  val cacheForever = s"max-age=${cacheDuration.toSeconds}"

  def storeImage(id: String, file: File, mimeType: Option[String], meta: Map[String, String] = Map.empty) =
    store(imageBucket, id, file, mimeType, meta, Some(cacheForever))

  def storeThumbnail(id: String, file: File, mimeType: Option[String]) =
    store(thumbnailBucket, id, file, mimeType, cacheControl = Some(cacheForever))

  def deleteImage(id: String) = Future {
    client.deleteObject(imageBucket, id)
    log.info(s"Deleted image $id from bucket $imageBucket")
  }

  def deleteThumbnail(id: String) = Future {
    client.deleteObject(thumbnailBucket, id)
  }

}
