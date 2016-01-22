package com.gu.mediaservice.model

import org.joda.time.DateTime
import play.api.libs.json._


case class PrintUsageRequest(printUsageRecords: List[PrintUsageRecord])
object PrintUsageRequest {
  implicit val reads: Reads[PrintUsageRequest] = Json.reads[PrintUsageRequest]
  implicit val writes: Writes[PrintUsageRequest] = Json.writes[PrintUsageRequest]
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
  implicit val writes: Writes[PrintUsageRecord] = Json.writes[PrintUsageRecord]
}

