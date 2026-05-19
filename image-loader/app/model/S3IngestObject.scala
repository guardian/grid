package model

import com.gu.mediaservice.lib.ImageStorageProps
import com.gu.mediaservice.lib.logging.LogMarker
import lib.storage.ImageLoaderStore

import java.time.Instant
import scala.jdk.CollectionConverters._

case class S3IngestObject (
  key: String,
  uploadedBy: String,
  filename:String,
  maybeMediaIdFromUiUpload: Option[String],
  uploadTime: Instant,
  contentLength: Long,
  getInputStream: () => java.io.InputStream,
  identifiers: Map[String, String] = Map.empty
)

object S3IngestObject {

  def apply (key: String, store: ImageLoaderStore)(implicit logMarker: LogMarker): S3IngestObject  = {

    val keyParts = key.split("/")

    val s3Object = store.getS3Object(key)
    val response = s3Object.response()
    val metadata = response.metadata().asScala

    S3IngestObject(
      key,
      uploadedBy = keyParts.head,
      filename = keyParts.last,
      maybeMediaIdFromUiUpload = metadata.get("media-id"), // set by the client in upload in manager.js
      uploadTime = response.lastModified(),
      contentLength = response.contentLength(),
      getInputStream = () => s3Object,
      identifiers = metadata.collect {
        case (key, value) if key.startsWith(ImageStorageProps.identifierMetadataKeyPrefix) =>
          key.stripPrefix(ImageStorageProps.identifierMetadataKeyPrefix) -> value
      }.toMap
    )
  }
}

