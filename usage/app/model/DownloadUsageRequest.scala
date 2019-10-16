package model

import com.gu.mediaservice.model.usage.{DownloadUsageMetadata, UnknownUsageStatus, UsageStatus}
import org.joda.time.DateTime
import play.api.libs.json.{JodaReads, JodaWrites, Json, Reads, Writes}

case class DownloadUsageRequest (
  dateAdded: DateTime,
  downloadedBy: String,
  mediaId: String
) {
  val metadata: DownloadUsageMetadata = DownloadUsageMetadata(downloadedBy)
  val status: UsageStatus = UnknownUsageStatus
}
object DownloadUsageRequest {
  import JodaWrites._
  import JodaReads._

  implicit val reads: Reads[DownloadUsageRequest] = Json.reads[DownloadUsageRequest]
  implicit val writes: Writes[DownloadUsageRequest] = Json.writes[DownloadUsageRequest]
}

