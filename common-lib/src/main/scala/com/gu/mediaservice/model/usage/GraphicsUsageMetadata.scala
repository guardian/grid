package com.gu.mediaservice.model.usage

import play.api.libs.json.{Json, Reads, Writes}

case class GraphicsUsageMetadata(
      addedBy: String
) extends UsageMetadata {
  override def toMap: Map[String, Any] = Map(
    "addedBy" -> addedBy
  )
}

object GraphicsUsageMetadata {
  implicit val reader: Reads[GraphicsUsageMetadata] = Json.reads[GraphicsUsageMetadata]
  implicit val writer: Writes[GraphicsUsageMetadata] = Json.writes[GraphicsUsageMetadata]
}
