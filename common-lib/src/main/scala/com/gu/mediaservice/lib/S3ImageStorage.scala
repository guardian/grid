package com.gu.mediaservice.lib

import com.gu.mediaservice.lib.aws.S3
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.MimeType
import org.slf4j.LoggerFactory
import software.amazon.awssdk.services.s3.model.{DeleteObjectRequest, HeadObjectRequest, ListObjectsV2Request}

import java.io.File
import scala.jdk.CollectionConverters._
import scala.concurrent.Future

// TODO: If deleteObject fails - we should be catching the errors here to avoid them bubbling to the application
class S3ImageStorage(config: CommonConfig) extends S3(config) with ImageStorage with GridLogging {

  private val cacheSetting = Some(cacheForever)
  def storeImage(bucket: String, id: String, file: File, mimeType: Option[MimeType],
                 meta: Map[String, String] = Map.empty, overwrite: Boolean)
                (implicit logMarker: LogMarker) = {
    logger.info(logMarker, s"bucket: $bucket, id: $id, meta: $meta")
    val eventualObject = if (overwrite) {
      storeV2(bucket, id, file, mimeType, meta, cacheSetting)
    } else {
      storeIfNotPresentV2(bucket, id, file, mimeType, meta, cacheSetting)
    }
    eventualObject.onComplete(o => logger.info(logMarker, s"storeImage completed $o"))
    eventualObject
  }

  def deleteImage(bucket: String, key: String)(implicit logMarker: LogMarker) = Future {
    logger.info(logMarker, s"Deleted image $key from bucket $bucket")
    clientV2.deleteObject(
      DeleteObjectRequest.builder().bucket(bucket).key(key).build())
  }

  def deleteVersionedImage(bucket: String, id: String)(implicit logMarker: LogMarker) = Future {
    val objectVersion = clientV2.headObject(HeadObjectRequest.builder().bucket(bucket).key(id).build()).versionId()
    clientV2.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(id).versionId(objectVersion).build())
    logger.info(logMarker, s"Deleted image $id from bucket $bucket (version: $objectVersion)")
  }

  def deleteFolder(bucket: String, id: String)(implicit logMarker: LogMarker) = Future {
    val files = clientV2.listObjectsV2(
      ListObjectsV2Request.builder().bucket(bucket).prefix(id).build()
    ).contents().asScala.toList
    files.foreach(file => clientV2.deleteObject(
      DeleteObjectRequest.builder().bucket(bucket).key(file.key()).build()
    ))
		logger.info(logMarker, s"Deleting images in folder $id from bucket $bucket")
	}

}
