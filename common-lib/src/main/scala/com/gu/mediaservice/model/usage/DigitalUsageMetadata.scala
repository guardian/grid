package com.gu.mediaservice.model

import play.api.libs.json._
import org.joda.time.DateTime


case class DigitalUsageMetadata(
  webTitle: String,
  webUrl: String,
  sectionId: String,
  composerUrl: Option[String] = None
) {
  val placeholderWebTitle = "No title given"
  val dynamoSafeWebTitle = if (webTitle.isEmpty) placeholderWebTitle else webTitle

  def toMap = Map(
    "webTitle" -> dynamoSafeWebTitle,
    "webUrl" -> webUrl,
    "sectionId" -> sectionId
  ) ++ composerUrl.map("composerUrl" -> _)
}
object DigitalUsageMetadata {
  implicit val dateTimeFormat = DateFormat
  implicit val reads: Reads[DigitalUsageMetadata] = Json.reads[DigitalUsageMetadata]
  implicit val writes: Writes[DigitalUsageMetadata] = Json.writes[DigitalUsageMetadata]
}
