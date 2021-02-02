package model

import play.api.libs.json._

case class UploadStatus(
                         id: String,
                         status: StatusType,
                         fileName: Option[String],
                         uploadedBy: Option[String],
                         uploadTime: Option[String],
                         identifiers: Option[String],
                         errorMessages: Option[String],
                       )

object UploadStatus {
  val reads: Reads[UploadStatus] = Json.reads[UploadStatus]
  val writes: Writes[UploadStatus] = Json.writes[UploadStatus]

  implicit val formats: Format[UploadStatus] = Format(reads, writes)
}

case class UpdateUploadStatusRequest(status: StatusType, errorMessages: Option[String])

object UpdateUploadStatusRequest {
  val reads: Reads[UpdateUploadStatusRequest] = Json.reads[UpdateUploadStatusRequest]
  val writes: Writes[UpdateUploadStatusRequest] = Json.writes[UpdateUploadStatusRequest]

  implicit val formats: Format[UpdateUploadStatusRequest] = Format(reads, writes)
}

case class UpdateUploadStatusResponse(status: StatusType)

object UpdateUploadStatusResponse {
  val reads: Reads[UpdateUploadStatusResponse] = Json.reads[UpdateUploadStatusResponse]
  val writes: Writes[UpdateUploadStatusResponse] = Json.writes[UpdateUploadStatusResponse]

  implicit val formats: Format[UpdateUploadStatusResponse] = Format(reads, writes)
}

sealed trait StatusType { def name: String }
object StatusType {
  case object Pending extends StatusType { val name = "PENDING" }
  case object Completed extends StatusType { val name = "COMPLETED" }
  case object Failed extends StatusType { val name = "FAILED" }

  implicit val reads: Reads[StatusType] = new Reads[StatusType] {
    override def reads(json: JsValue): JsResult[StatusType] = json match {
      case JsString("PENDING") => JsSuccess(Pending)
      case JsString("COMPLETED") => JsSuccess(Completed)
      case JsString("FAILED") => JsSuccess(Failed)
      case _ => JsError("Bad Status")
    }
  }
  implicit val writer: Writes[StatusType] = (statusType: StatusType) => JsString(statusType.name)

  def apply(statusType: String): StatusType = statusType match {
    case "PENDING" => Pending
    case "COMPLETED" => Completed
    case "FAILED" => Failed
  }
}
