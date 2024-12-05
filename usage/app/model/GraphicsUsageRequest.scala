package model

import com.gu.mediaservice.model.usage.{GraphicsUsageMetadata, GraphicsUsageStatus, UsageStatus}
import org.joda.time.DateTime
import play.api.libs.json.{JodaReads, JodaWrites, Json, Reads, Writes}

case class GraphicsUsageRequest(
   dateAdded: DateTime,
   addedBy: String,
   mediaId: String
) {
  val metadata: GraphicsUsageMetadata = GraphicsUsageMetadata(addedBy)
  val status: UsageStatus = GraphicsUsageStatus
}
object GraphicsUsageRequest {
  import JodaWrites._
  import JodaReads._

  implicit val reads: Reads[GraphicsUsageRequest] = Json.reads[GraphicsUsageRequest]
  implicit val writes: Writes[GraphicsUsageRequest] = Json.writes[GraphicsUsageRequest]
}
