package model

import java.io.File
import java.util.UUID

import com.gu.mediaservice.lib.logging.{FALLBACK, LoggingMarker}
import com.gu.mediaservice.model.UploadInfo
import net.logstash.logback.marker.LogstashMarker
import org.joda.time.format.ISODateTimeFormat
import org.joda.time.{DateTime, DateTimeZone}

case class UploadRequest(
  requestId: UUID,
  imageId: String,
  tempFile: File,
  mimeType: Option[String],
  uploadTime: DateTime,
  uploadedBy: String,
  identifiers: Map[String, String],
  uploadInfo: UploadInfo
) extends LoggingMarker {
  val identifiersMeta: Map[String, String] = identifiers.map { case (k, v) => (s"identifier!$k", v) }

  override def toLogMarker: LogstashMarker = super.toLogMarker(
    Map (
      "requestId" -> requestId,
      "imageId" -> imageId,
      "mimeType" -> mimeType.getOrElse(FALLBACK),
      "uploadTime" -> ISODateTimeFormat.dateTime.print(uploadTime.withZone(DateTimeZone.UTC)),
      "uploadedBy" -> uploadedBy,
      "filename" -> uploadInfo.filename.getOrElse(FALLBACK),
      "filesize" -> tempFile.length
    ) ++ identifiersMeta
  )
}
