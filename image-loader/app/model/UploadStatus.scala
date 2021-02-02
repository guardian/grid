package model

import play.api.libs.json._

case class UploadStatus(
                         id: String,
                         status: String,
                         fileName: Option[String],
                         uploadedBy: Option[String],
                         uploadTime: Option[String],
                         identifiers: Option[String],
                         errorMessages: Option[String],
                       )

object UploadStatus {
  val PENDING = "PENDING"
  val COMPLETED = "COMPLETED"
  val FAILED = "FAILED"
  val reads: Reads[UploadStatus] = Json.reads[UploadStatus]
  val writes: Writes[UploadStatus] = Json.writes[UploadStatus]

  implicit val formats: Format[UploadStatus] = Format(reads, writes)
}
