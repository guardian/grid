package model.upload

import com.gu.mediaservice.lib.ImageStorageProps
import com.gu.mediaservice.model.{MimeType, UploadInfo}

import java.io.File
import java.time.Instant

case class UploadRequest(
                          imageId: String,
                          tempFile: File,
                          mimeType: Option[MimeType],
                          uploadTime: Instant,
                          uploadedBy: String,
                          identifiers: Map[String, String],
                          uploadInfo: UploadInfo,
                        ) {

  val identifiersMeta: Map[String, String] = identifiers.map { case (k, v) =>
    (s"${ImageStorageProps.identifierMetadataKeyPrefix}$k", v)
  }

}
