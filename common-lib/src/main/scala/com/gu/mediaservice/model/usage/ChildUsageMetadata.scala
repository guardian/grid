package com.gu.mediaservice.model.usage

import play.api.libs.json.{Json, Reads, Writes}

case class ChildUsageMetadata(
  addedBy: String,
  childMediaId: String

) extends UsageMetadata {
  override def toMap: Map[String, Any] = Map(
    "addedBy" -> addedBy,
    "childMediaId" -> childMediaId
  )
}

object ChildUsageMetadata {
  implicit val reader: Reads[ChildUsageMetadata] = Json.reads[ChildUsageMetadata]
  implicit val writer: Writes[ChildUsageMetadata] = Json.writes[ChildUsageMetadata]
}
