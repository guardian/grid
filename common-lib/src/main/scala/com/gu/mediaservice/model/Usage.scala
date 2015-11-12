package com.gu.mediaservice.model

import play.api.libs.json._
import org.joda.time.DateTime


case class Usage(
  source: List[UsageSource],
  usageType: String,
  mediaType: String,
  status: String,
  dateAdded: Option[DateTime],
  dateRemoved: Option[DateTime],
  lastModified: DateTime
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

case class UsageSource(
  usageType: String,
  uri: Option[String] = None,
  name: Option[String] = None
)
object UsageSource {
  implicit val writes: Writes[UsageSource] = Json.writes[UsageSource]
  implicit val reads: Reads[UsageSource] = Json.reads[UsageSource]
}
