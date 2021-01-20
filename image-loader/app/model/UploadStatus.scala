package model

import play.api.libs.json._

case class UploadStatus(
                         id: String,
                         uploadedBy: String,
                         fileName: String,
                         status: String
                       )

object UploadStatus {
  val PENDING = "PENDING"
  val COMPLETED = "COMPLETED"
  val FAILED = "FAILED"
  val reads: Reads[UploadStatus] = Json.reads[UploadStatus]
  val writes: Writes[UploadStatus] = Json.writes[UploadStatus]

  implicit val formats: Format[UploadStatus] = Format(reads, writes)
}
