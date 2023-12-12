package model

import com.gu.mediaservice.lib.ImageStorageProps
import com.gu.mediaservice.lib.aws.S3DataFromSqsMessage
import lib.storage.ImageLoaderStore
import com.gu.mediaservice.lib.net.URI.{decode => uriDecode}

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
  def apply (s3DataFromSqsMessage: S3DataFromSqsMessage, store: ImageLoaderStore): S3IngestObject  = {

    val key = uriDecode(s3DataFromSqsMessage.`object`.key)
    val keyParts = key.split("/")

    /**
     * the last part of the object key (uri decoded) by slashes,
     * expected to be a SHA-1 hash of the file if manually uploaded,
     * else the original filename (e.g. FTP upload)
     */
    val filenameInS3: String = keyParts.last
    val s3Object = store.getS3Object(key)
    val metadata = s3Object.getObjectMetadata
    val maybeFilenameFromMetadata = metadata.getUserMetadata.asScala.get(ImageStorageProps.filenameMetadataKey) // set on the upload metadata by the client when uploading to ingest bucket


    S3IngestObject(
      key,
      uploadedBy= keyParts.head,
      filename = maybeFilenameFromMetadata.getOrElse(filenameInS3),
      maybeMediaIdFromUiUpload = maybeFilenameFromMetadata.map(_ => filenameInS3),
      uploadTime = metadata.getLastModified,
      contentLength = metadata.getContentLength,
      getInputStream = () => s3Object.getObjectContent
    )
  }
}

