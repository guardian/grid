package com.gu.mediaservice.model

import org.joda.time.DateTime
import play.api.libs.json._

case class FrontUsageRequest(
  dateAdded: DateTime,
  mediaId: String,
  frontUsageMetadata: FrontUsageMetadata,
  usageId: String,
  containerId: String,
  usageStatus: UsageStatus
)
object FrontUsageRequest {
  import JodaWrites._
  import JodaReads._

  implicit val reads: Reads[FrontUsageRequest] = Json.reads[FrontUsageRequest]
  implicit val writes: Writes[FrontUsageRequest] = Json.writes[FrontUsageRequest]
}

