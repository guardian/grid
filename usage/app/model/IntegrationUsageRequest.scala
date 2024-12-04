package model

import com.gu.mediaservice.model.usage.{IntegrationUsageMetadata, IntegrationUsageStatus, UsageStatus}
import org.joda.time.DateTime
import play.api.libs.json.{JodaReads, JodaWrites, Json, Reads, Writes}

case class IntegrationUsageRequest (
  dateAdded: DateTime,
  integratedBy: String,
  mediaId: String
) {
  val metadata: IntegrationUsageMetadata = IntegrationUsageMetadata(integratedBy)
  val status: UsageStatus = IntegrationUsageStatus
}
object IntegrationUsageRequest {
  import JodaWrites._
  import JodaReads._

  implicit val reads: Reads[IntegrationUsageRequest] = Json.reads[IntegrationUsageRequest]
  implicit val writes: Writes[IntegrationUsageRequest] = Json.writes[IntegrationUsageRequest]
}
