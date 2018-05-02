package model

import java.io.File
import com.gu.mediaservice.model.UploadInfo
import org.joda.time.DateTime

case class UploadRequest(
  id: String,
  tempFile: File,
  mimeType: Option[String],
  uploadTime: DateTime,
  uploadedBy: String,
  identifiers: Map[String, String],
  uploadInfo: UploadInfo
) {
  val identifiersMeta = identifiers.map { case (k, v) => (s"identifier!$k", v) }
}
