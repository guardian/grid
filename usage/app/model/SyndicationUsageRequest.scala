package model

import com.gu.mediaservice.model.usage.{PendingUsageStatus, SyndicatedUsageStatus, SyndicationUsageMetadata, UsageStatus}
import org.joda.time.DateTime
import play.api.libs.json._

case class SyndicationUsageRequest (
  partnerName: String,
  syndicatedBy: Option[String],
  startPending: Option[Boolean],
  mediaId: String,
  dateAdded: DateTime
) {
  val status: UsageStatus = startPending match {
    case Some(true) => PendingUsageStatus
    case _ => SyndicatedUsageStatus
  }
  val metadata: SyndicationUsageMetadata = SyndicationUsageMetadata(partnerName, syndicatedBy)
}
object SyndicationUsageRequest {
  import JodaWrites._
  import JodaReads._

  implicit val reads: Reads[SyndicationUsageRequest] = Json.reads[SyndicationUsageRequest]
  implicit val writes: Writes[SyndicationUsageRequest] = Json.writes[SyndicationUsageRequest]
}
