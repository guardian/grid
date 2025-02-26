package model

import com.gu.mediaservice.lib.logging.LogMarker
import lib.storage.ImageLoaderStore

import scala.jdk.CollectionConverters._

case class S3IngestObject (
  key: String,
  uploadedBy: String,
  filename:String,
  maybeMediaIdFromUiUpload: Option[String],
  uploadTime: java.util.Date,
  contentLength: Long,
  getInputStream: () => java.io.InputStream,
  isFeedUpload: Boolean,
)

object S3IngestObject {

  def apply (key: String, store: ImageLoaderStore)(implicit logMarker: LogMarker): S3IngestObject  = {

    val keyParts = key.split("/")

    val s3Object = store.getS3Object(key)
    val metadata = s3Object.getObjectMetadata

    val mediaIdFromUiUpload = metadata.getUserMetadata.asScala.get("media-id")
    val isFeedUpload = mediaIdFromUiUpload.isEmpty  // TODO Not concise

    val indexOfFeedProviderName = if (keyParts.contains("feeds")) {
      keyParts.indexOf("feeds") + 1
    } else {
      0
    }
    val feedProvidedName = keyParts(Seq(indexOfFeedProviderName, 0).max)

    S3IngestObject(
      key,
      uploadedBy = feedProvidedName,
      filename = keyParts.last,
      maybeMediaIdFromUiUpload = mediaIdFromUiUpload, // set by the client in upload in manager.js
      uploadTime = metadata.getLastModified,
      contentLength = metadata.getContentLength,
      getInputStream = () => s3Object.getObjectContent,
      isFeedUpload = isFeedUpload
    )
  }
}

