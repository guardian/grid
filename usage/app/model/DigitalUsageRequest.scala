package model

import org.joda.time.DateTime
import com.gu.mediaservice.model.{DigitalUsageMetadata, DateFormat}
import play.api.libs.json._


case class DigitalUsageRequest(printUsageRecords: List[DigitalUsageRecord])
object DigitalUsageRequest{
  implicit val reads: Reads[DigitalUsageRequest] = Json.reads[DigitalUsageRequest]
}
case class DigitalUsageRecord(
  dateAdded: DateTime,
  mediaId: String,
  digitalUsageMetadata: DigitalUsageMetadata,
  containerId: String,
  usageId: String,
  usageStatus: UsageStatus
)
object DigitalUsageRecord {
  implicit val dateTimeFormat = DateFormat
  implicit val reads: Reads[DigitalUsageRecord] = Json.reads[DigitalUsageRecord]
}
