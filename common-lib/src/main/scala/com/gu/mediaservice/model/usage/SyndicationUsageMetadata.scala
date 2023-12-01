package com.gu.mediaservice.model.usage

import play.api.libs.json._

case class SyndicationUsageMetadata(
  partnerName: String,
  syndicatedBy: Option[String]
) extends UsageMetadata {
  override def toMap: Map[String, Any] = {
    syndicatedBy match {
      case Some(user) => Map("partnerName" -> partnerName, "syndicatedBy" -> user)
      case None       => Map("partnerName" -> partnerName)
    }
  }
}

object SyndicationUsageMetadata {
  implicit val reader: Reads[SyndicationUsageMetadata] = Json.reads[SyndicationUsageMetadata]
  implicit val writer: Writes[SyndicationUsageMetadata] = Json.writes[SyndicationUsageMetadata]
}
