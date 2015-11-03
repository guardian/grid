package model

import org.joda.time.DateTime
import com.gu.mediaservice.model.DateFormat
import play.api.libs.json._

case class PrintUsageRequest(printUsageRecords: List[PrintUsageRecord])
object PrintUsageRequest {
  implicit val reads: Reads[PrintUsageRequest] = Json.reads[PrintUsageRequest]
}
case class PrintUsageRecord(
  dateAdded: DateTime,
  mediaId: String,
  printUsageDetails: PrintUsageDetails,
  containerId: String,
  usageId: String,
  usageStatus: UsageStatus
)
object PrintUsageRecord {
  implicit val dateTimeFormat = DateFormat
  implicit val reads: Reads[PrintUsageRecord] = Json.reads[PrintUsageRecord]
}
case class PrintUsageDetails(
  sectionName: String,
  issueDate: DateTime,
  pageNumber: Int,
  storyName: String,
  publicationCode: String,
  layoutId: Long,
  edition: Int,
  size: PrintImageSize,
  orderedBy: String,
  sectionCode: String
)
object PrintUsageDetails {
  implicit val dateTimeFormat = DateFormat
  implicit val reads: Reads[PrintUsageDetails] = Json.reads[PrintUsageDetails]
}
case class PrintImageSize(
  x: Int,
  y: Int
)
object PrintImageSize {
  implicit val reads: Reads[PrintImageSize] = Json.reads[PrintImageSize]
}
