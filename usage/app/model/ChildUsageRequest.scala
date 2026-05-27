package model

import com.gu.mediaservice.model.usage.{ChildUsageMetadata, DerivativeUsageStatus, ReplacedUsageStatus, UsageStatus}
import org.joda.time.DateTime
import play.api.libs.json.{JodaReads, JodaWrites, Json, Reads, Writes}

case class ChildUsageRequest (
  dateAdded: DateTime,
  addedBy: String,
  mediaId: String,
  childMediaId: String,
  isReplacement: Boolean
) {
  val metadata: ChildUsageMetadata = ChildUsageMetadata(addedBy, childMediaId)
  val status: UsageStatus = if(isReplacement) ReplacedUsageStatus else DerivativeUsageStatus
}
object ChildUsageRequest {
  import JodaWrites._
  import JodaReads._

  implicit val reads: Reads[ChildUsageRequest] = Json.reads[ChildUsageRequest]
  implicit val writes: Writes[ChildUsageRequest] = Json.writes[ChildUsageRequest]
}

