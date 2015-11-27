package com.gu.mediaservice.model

import play.api.libs.json._
import org.joda.time.DateTime


case class Usage(
  id: String,
  grouping: String,
  references: List[UsageReference],
  `type`: String,
  mediaId: String,
  mediaType: String,
  status: String,
  dateAdded: Option[DateTime],
  dateRemoved: Option[DateTime],
  lastModified: DateTime,
  isRemoved: Boolean
)
object Usage {
  implicit val dateTimeWrites: Writes[DateTime] = new Writes[DateTime] {
    def writes(d: DateTime) = DateFormat.writes(d)
  }

  implicit val dateTimeReads: Reads[DateTime] = new Reads[DateTime] {
    def reads(json: JsValue) = DateFormat.reads(json)
  }

  implicit val writes: Writes[Usage] = Json.writes[Usage]
  implicit val reads: Reads[Usage] = Json.reads[Usage]
}

case class UsageReference(
  `type`: String,
  uri: Option[String] = None,
  name: Option[String] = None
)
object UsageReference {
  implicit val writes: Writes[UsageReference] = Json.writes[UsageReference]
  implicit val reads: Reads[UsageReference] = Json.reads[UsageReference]
}
