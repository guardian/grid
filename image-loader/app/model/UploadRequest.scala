package model

import java.io.File
import org.joda.time.DateTime


case class UploadRequest(
  id: String,
  tempFile: File,
  mimeType: Option[String],
  uploadTime: DateTime,
  uploadedBy: String,
  identifiers: Map[String, String]
) {
  val identifiersMeta = identifiers.map { case (k,v) => (s"identifier!$k", v) }.toMap
}
