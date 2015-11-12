package com.gu.mediaservice.model

import play.api.libs.json._
import org.joda.time.DateTime


case class Usage(
  title: String,
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
  implicit val writes: Writes[Usage] = Json.writes[Usage]
}
