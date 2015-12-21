package model

import org.joda.time.DateTime
import com.gu.mediaservice.model.{PrintUsageMetadata, DateFormat}
import play.api.libs.json._

case class PrintUsageRequest(printUsageRecords: List[PrintUsageRecord])
object PrintUsageRequest {
  implicit val reads: Reads[PrintUsageRequest] = Json.reads[PrintUsageRequest]
}
case class PrintUsageRecord(
  dateAdded: DateTime,
  mediaId: String,
  printUsageMetadata: PrintUsageMetadata,
  containerId: String,
  usageId: String,
  usageStatus: UsageStatus
)
object PrintUsageRecord {
  implicit val dateTimeFormat = DateFormat
  implicit val reads: Reads[PrintUsageRecord] = Json.reads[PrintUsageRecord]
}

