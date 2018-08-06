package com.gu.mediaservice.model.usage

import play.api.libs.json._

case class FrontUsageMetadata(
  addedBy: String,
  front: String
) extends UsageMetadata {
  override def toMap: Map[String, Any] = Map(
    "addedBy" -> addedBy,
    "front" -> front
  )
}

object FrontUsageMetadata {
  implicit val reader: Reads[FrontUsageMetadata] = Json.reads[FrontUsageMetadata]
  implicit val writer: Writes[FrontUsageMetadata] = Json.writes[FrontUsageMetadata]
}
