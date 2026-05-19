package com.gu.mediaservice.lib

import com.gu.mediaservice.lib.aws.S3
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.MimeType
import software.amazon.awssdk.services.s3.model.{DeleteObjectRequest, HeadObjectRequest, ListObjectsRequest}

import java.io.File
import scala.concurrent.Future
import scala.jdk.CollectionConverters._

// TODO: If deleteObject fails - we should be catching the errors here to avoid them bubbling to the application
class S3ImageStorage(config: CommonConfig) extends S3(config) with ImageStorage with GridLogging {

  private val cacheSetting = Some(cacheForever)
  def storeImage(bucket: String, id: String, file: File, mimeType: Option[MimeType],
                 meta: Map[String, String] = Map.empty, overwrite: Boolean)
                (implicit logMarker: LogMarker) = {
    logger.info(logMarker, s"bucket: $bucket, id: $id, meta: $meta")
    val eventualObject = if (overwrite) {
      store(bucket, id, file, mimeType, meta, cacheSetting)
    } else {
      storeIfNotPresent(bucket, id, file, mimeType, meta, cacheSetting)
    }
    eventualObject.onComplete(o => logger.info(logMarker, s"storeImage completed $o"))
    eventualObject
  }

  def deleteImage(bucket: String, id: String)(implicit logMarker: LogMarker) = Future {
    client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(id).build())
    logger.info(logMarker, s"Deleted image $id from bucket $bucket")
  }

  def deleteVersionedImage(bucket: String, id: String)(implicit logMarker: LogMarker) = Future {
    val objectVersion = client.headObject(HeadObjectRequest.builder().bucket(bucket).key(id).build()).versionId()
    client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(id).versionId(objectVersion).build())
    logger.info(logMarker, s"Deleted image $id from bucket $bucket (version: $objectVersion)")
  }

  def deleteFolder(bucket: String, id: String)(implicit logMarker: LogMarker) = Future {
		val files = client.listObjects(ListObjectsRequest.builder().bucket(bucket).prefix(s"$id/").build()).contents().asScala
		files.foreach(file => client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(file.key()).build()))
		logger.info(logMarker, s"Deleting images in folder $id from bucket $bucket")
	}

}
