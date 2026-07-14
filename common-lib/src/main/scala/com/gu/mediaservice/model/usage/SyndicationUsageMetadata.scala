package com.gu.mediaservice.model.usage

import com.gu.mediaservice.lib.dynamo.{DbString, DynamoElement}
import play.api.libs.json._

case class SyndicationUsageMetadata(
  partnerName: String,
  syndicatedBy: Option[String] = None
) extends UsageMetadata {
  override def toMap: Map[String, String] = Map(
    "partnerName" -> partnerName
  ) ++ syndicatedBy.map("syndicatedBy" -> _)

  override def toDynamoMap: Map[String, DynamoElement] = Map(
    "partnerName" -> DbString(partnerName)
  ) ++ syndicatedBy.map(s => "syndicatedBy" -> DbString(s))
}

object SyndicationUsageMetadata {
  implicit val reader: Reads[SyndicationUsageMetadata] = Json.reads[SyndicationUsageMetadata]
  implicit val writer: Writes[SyndicationUsageMetadata] = Json.writes[SyndicationUsageMetadata]
}
