package com.gu.mediaservice.model.usage

import com.gu.mediaservice.lib.dynamo.{DbString, DynamoElement}
import play.api.libs.json.{Json, Reads, Writes}

case class ChildUsageMetadata(
  addedBy: String,
  childMediaId: String

) extends UsageMetadata {
  override def toMap: Map[String, Any] = Map(
    "addedBy" -> addedBy,
    "childMediaId" -> childMediaId
  )

  override def toDynamoMap: Map[String, DynamoElement] = Map(
    "addedBy" -> DbString(addedBy),
    "childMediaId" -> DbString(childMediaId)
  )
}

object ChildUsageMetadata {
  implicit val reader: Reads[ChildUsageMetadata] = Json.reads[ChildUsageMetadata]
  implicit val writer: Writes[ChildUsageMetadata] = Json.writes[ChildUsageMetadata]
}
