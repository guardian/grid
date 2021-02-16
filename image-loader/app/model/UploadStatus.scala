package model

import play.api.libs.json._

case class UploadStatusRecord(
                               id: String,
                               fileName: Option[String],
                               uploadedBy: String,
                               uploadTime: String,
                               identifiers: Option[String],
                               status: StatusType,
                               errorMessage: Option[String],
                               expires: Long
                             )

object UploadStatusRecord {
  implicit val formats: Format[UploadStatusRecord] = Json.format[UploadStatusRecord]
}

case class UploadStatus(status: StatusType, errorMessage: Option[String])

object UploadStatus {
  implicit val formats: Format[UploadStatus] = Json.format[UploadStatus]
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
