package model

import org.joda.time.DateTime
import com.gu.mediaservice.model.usage.{IntegrationUsageMetadata, IntegrationUsageStatus, UsageStatus}
import play.api.libs.json.{Json, Reads, Writes}

case class IntegrationUsageRequest (
  dateAdded: DateTime,
  integrationTool: String,
  integratedBy: String,
  mediaId: String
) {
  val metadata: IntegrationUsageMetadata = IntegrationUsageMetadata(integratedBy, integrationTool)
  val status: UsageStatus = IntegrationUsageStatus
}
object IntegrationUsageRequest {
  implicit val reads: Reads[IntegrationUsageRequest] = Json.reads[IntegrationUsageRequest]
  implicit val writes: Writes[IntegrationUsageRequest] = Json.writes[IntegrationUsageRequest]
}
