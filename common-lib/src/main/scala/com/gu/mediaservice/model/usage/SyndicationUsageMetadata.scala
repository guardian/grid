package com.gu.mediaservice.model.usage

import play.api.libs.json._

case class SyndicationUsageMetadata(
  partnerName: String,
  syndicatedBy: Option[String] = None
) extends UsageMetadata {
  override def toMap: Map[String, Any] = Map(
    "partnerName" -> partnerName
  ) ++ syndicatedBy.map("syndicatedBy" -> _)
}

object SyndicationUsageMetadata {
  implicit val reader: Reads[SyndicationUsageMetadata] = Json.reads[SyndicationUsageMetadata]
  implicit val writer: Writes[SyndicationUsageMetadata] = Json.writes[SyndicationUsageMetadata]
}
