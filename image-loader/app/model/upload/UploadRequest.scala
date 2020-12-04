package model.upload

import java.io.File
import java.util.UUID

import com.gu.mediaservice.model.{MimeType, UploadInfo}
import net.logstash.logback.marker.{LogstashMarker, Markers}
import org.joda.time.format.ISODateTimeFormat
import org.joda.time.{DateTime, DateTimeZone}
import scala.collection.JavaConverters._

case class UploadRequest(
                          requestId: UUID,
                          imageId: String,
                          tempFile: File,
                          mimeType: Option[MimeType],
                          uploadTime: DateTime,
                          uploadedBy: String,
                          identifiers: Map[String, String],
                          uploadInfo: UploadInfo
                        ) {

  val identifiersMeta: Map[String, String] = identifiers.map { case (k, v) => (s"identifier!$k", v) }

  def toLogMarker: LogstashMarker = {
    val fallback = "none"

    val markers = Map(
      "requestId" -> requestId,
      "imageId" -> imageId,
      "mimeType" -> mimeType.getOrElse(fallback),
      "uploadTime" -> ISODateTimeFormat.dateTime.print(uploadTime.withZone(DateTimeZone.UTC)),
      "uploadedBy" -> uploadedBy,
      "filename" -> uploadInfo.filename.getOrElse(fallback),
      "filesize" -> tempFile.length
    ) ++ identifiersMeta

    Markers.appendEntries(markers.asJava)
  }

}
