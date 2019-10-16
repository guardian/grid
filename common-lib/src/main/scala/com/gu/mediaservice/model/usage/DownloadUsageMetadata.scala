package com.gu.mediaservice.model.usage

import play.api.libs.json.{Json, Reads, Writes}

case class DownloadUsageMetadata(
  downloadedBy: String
) extends UsageMetadata {
  override def toMap: Map[String, Any] = Map(
    "downloadedBy" -> downloadedBy
  )
}

object DownloadUsageMetadata {
  implicit val reader: Reads[DownloadUsageMetadata] = Json.reads[DownloadUsageMetadata]
  implicit val writer: Writes[DownloadUsageMetadata] = Json.writes[DownloadUsageMetadata]
}
