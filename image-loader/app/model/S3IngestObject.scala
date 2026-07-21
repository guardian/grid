package model

import com.gu.mediaservice.lib.ImageStorageProps
import com.gu.mediaservice.lib.logging.LogMarker
import lib.storage.ImageLoaderStore

import java.util.Date
import scala.jdk.CollectionConverters._

case class S3IngestObject (
  key: String,
  uploadedBy: String,
  filename:String,
  maybeMediaIdFromUiUpload: Option[String],
  uploadTime: java.util.Date,
  contentLength: Long,
  getInputStream: () => java.io.InputStream,
  identifiers: Map[String, String] = Map.empty
)

object S3IngestObject {

  def apply (key: String, store: ImageLoaderStore)(implicit logMarker: LogMarker): S3IngestObject  = {

    val keyParts = key.split("/")

    val s3Object = store.getS3Object(key)
    val metadata = s3Object.response().metadata()

    S3IngestObject(
      key,
      uploadedBy = keyParts.head,
      filename = keyParts.last,
      maybeMediaIdFromUiUpload = metadata.asScala.toMap.get("media-id"), // set by the client in upload in manager.js
      uploadTime = new Date(s3Object.response().lastModified().toEpochMilli),
      contentLength = s3Object.response().contentLength(),
      getInputStream = () => s3Object,
      identifiers = metadata.asScala.collect{
        case (key, value) if key.startsWith(ImageStorageProps.identifierMetadataKeyPrefix) =>
          key.stripPrefix(ImageStorageProps.identifierMetadataKeyPrefix) -> value
      }.toMap
    )
  }
}

