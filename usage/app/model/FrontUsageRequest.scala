package model

import com.gu.mediaservice.model.usage.{FrontUsageMetadata, UnknownUsageStatus, UsageStatus}
import org.joda.time.DateTime
import play.api.libs.json._


case class FrontUsageRequest (
  dateAdded: DateTime,
  addedBy: String,
  front: String,
  mediaId: String
) {
  val metadata: FrontUsageMetadata = FrontUsageMetadata(addedBy, front)
  val status: UsageStatus = UnknownUsageStatus
}

object FrontUsageRequest {
  import JodaWrites._
  import JodaReads._

  implicit val reads: Reads[FrontUsageRequest] = Json.reads[FrontUsageRequest]
  implicit val writes: Writes[FrontUsageRequest] = Json.writes[FrontUsageRequest]
}
