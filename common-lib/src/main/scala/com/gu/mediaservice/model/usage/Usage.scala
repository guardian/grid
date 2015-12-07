package com.gu.mediaservice.model

import play.api.libs.json._
import org.joda.time.DateTime


case class Usage(
  id: String,
  references: List[UsageReference],
  platform: String,
  media: String,
  status: String,
  dateAdded: Option[DateTime],
  dateRemoved: Option[DateTime],
  lastModified: DateTime,
  printUsageMetadata: Option[PrintUsageMetadata] = None,
  digitalUsageMetadata: Option[DigitalUsageMetadata] = None
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


