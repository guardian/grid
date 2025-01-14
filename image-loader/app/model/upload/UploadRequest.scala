package model.upload

import com.gu.mediaservice.lib.ImageStorageProps

import java.io.File
import java.util.UUID
import com.gu.mediaservice.model.{Instance, MimeType, UploadInfo}
import net.logstash.logback.marker.{LogstashMarker, Markers}
import org.joda.time.format.ISODateTimeFormat
import org.joda.time.{DateTime, DateTimeZone}

import scala.jdk.CollectionConverters._

case class UploadRequest(
                          imageId: String,
                          tempFile: File,
                          mimeType: Option[MimeType],
                          uploadTime: DateTime,
                          uploadedBy: String,
                          identifiers: Map[String, String],
                          uploadInfo: UploadInfo,
                          instance: Instance,
                          isFeedUpload: Boolean
                        ) {

  val identifiersMeta: Map[String, String] = identifiers.map { case (k, v) =>
    (s"${ImageStorageProps.identifierMetadataKeyPrefix}$k", v)
  }

}
