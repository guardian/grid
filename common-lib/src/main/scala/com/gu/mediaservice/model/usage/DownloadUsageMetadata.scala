package com.gu.mediaservice.model.usage

import com.gu.mediaservice.lib.dynamo.{DbString, DynamoElement}
import play.api.libs.json.{Json, Reads, Writes}

case class DownloadUsageMetadata(
  downloadedBy: String
) extends UsageMetadata {
  override def toMap: Map[String, Any] = Map(
    "downloadedBy" -> downloadedBy
  )

  override def toDynamoMap: Map[String, DynamoElement] = Map(
    "downloadedBy" -> DbString(downloadedBy)
  )
}

object DownloadUsageMetadata {
  implicit val reader: Reads[DownloadUsageMetadata] = Json.reads[DownloadUsageMetadata]
  implicit val writer: Writes[DownloadUsageMetadata] = Json.writes[DownloadUsageMetadata]
}
