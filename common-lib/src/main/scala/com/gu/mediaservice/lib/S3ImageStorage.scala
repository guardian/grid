package com.gu.mediaservice.lib

import java.io.File

import com.gu.mediaservice.lib.aws.{S3, S3Ops}
import com.gu.mediaservice.lib.config.CommonConfig
import org.slf4j.LoggerFactory

import scala.collection.JavaConverters._
import scala.concurrent.Future

// TODO: If deleteObject fails - we should be catching the errors here to avoid them bubbling to the application
class S3ImageStorage(config: CommonConfig) extends S3(config) with ImageStorage {
  private val log = LoggerFactory.getLogger(getClass)

  def storeImage(bucket: String, id: String, file: File, mimeType: Option[String], meta: Map[String, String] = Map.empty) =
    store(bucket, id, file, mimeType, meta, Some(cacheForever))

  def deleteImage(bucket: String, id: String) = Future {
    client.deleteObject(bucket, id)
    log.info(s"Deleted image $id from bucket $bucket")
  }

  def deleteFolder(bucket: String, id: String) = Future {
		val files = client.listObjects(bucket, id).getObjectSummaries.asScala
		files.foreach(file => client.deleteObject(bucket, file.getKey))
		log.info(s"Deleting images in folder $id from bucket $bucket")
	}
}
