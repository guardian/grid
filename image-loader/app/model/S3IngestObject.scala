package model

import lib.storage.ImageLoaderStore

import scala.jdk.CollectionConverters.mapAsScalaMapConverter

case class S3IngestObject (
  key: String,
  uploadedBy: String,
  filename:String,
  maybeMediaIdFromUiUpload: Option[String],
  uploadTime: java.util.Date,
  contentLength: Long,
  getInputStream: () => java.io.InputStream
)

object S3IngestObject {

  def apply (key: String, store: ImageLoaderStore): S3IngestObject  = {

    val keyParts = key.split("/")

    val s3Object = store.getS3Object(key)
    val metadata = s3Object.getObjectMetadata

    S3IngestObject(
      key,
      uploadedBy = keyParts.head,
      filename = keyParts.last,
      maybeMediaIdFromUiUpload = metadata.getUserMetadata.asScala.get("media-id"), // set by the client in upload in manager.js
      uploadTime = metadata.getLastModified,
      contentLength = metadata.getContentLength,
      getInputStream = () => s3Object.getObjectContent
    )
  }
}

