package com.gu.mediaservice.model.usage

import play.api.libs.json.{Json, Reads, Writes}

case class IntegrationUsageMetadata(
  integratedBy: String
) extends UsageMetadata {
  override def toMap: Map[String, Any] = Map(
    "integratedBy" -> integratedBy
  )
}

object IntegrationUsageMetadata {
  implicit val reader: Reads[IntegrationUsageMetadata] = Json.reads[IntegrationUsageMetadata]
  implicit val writer: Writes[IntegrationUsageMetadata] = Json.writes[IntegrationUsageMetadata]
}
