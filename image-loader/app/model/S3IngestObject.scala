package model

import com.gu.mediaservice.lib.feature.VipsImagingSwitch
import com.gu.mediaservice.lib.logging.LogMarker
import lib.storage.ImageLoaderStore

import scala.jdk.CollectionConverters.mapAsScalaMapConverter

case class S3IngestObject (
  key: String,
  uploadedBy: String,
  filename:String,
  maybeMediaIdFromUiUpload: Option[String],
  useVips: Boolean,
  uploadTime: java.util.Date,
  contentLength: Long,
  getInputStream: () => java.io.InputStream
)

object S3IngestObject {

  def apply (key: String, store: ImageLoaderStore)(implicit logMarker: LogMarker): S3IngestObject  = {

    val keyParts = key.split("/")

    val s3Object = store.getS3Object(key)
    val metadata = s3Object.getObjectMetadata
    val userMetadata = metadata.getUserMetadata.asScala

    S3IngestObject(
      key,
      uploadedBy = keyParts.head,
      filename = keyParts.last,
      maybeMediaIdFromUiUpload = userMetadata.get("media-id"), // set by the client in upload in manager.js
      useVips = userMetadata.get(VipsImagingSwitch.name).contains("true") || VipsImagingSwitch.default,
      uploadTime = metadata.getLastModified,
      contentLength = metadata.getContentLength,
      getInputStream = () => s3Object.getObjectContent
    )
  }
}
