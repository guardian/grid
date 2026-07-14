package com.gu.mediaservice.model.usage

import com.gu.mediaservice.lib.dynamo.{DbString, DynamoElement}

import java.net.URI
import play.api.libs.json._
import com.gu.mediaservice.syntax._

case class DigitalUsageMetadata (
  webUrl: URI,
  webTitle: String,
  sectionId: String,
  composerUrl: Option[URI] = None
) extends UsageMetadata {
  private val placeholderWebTitle = "No title given"
  private val dynamoSafeWebTitle = if(webTitle.isEmpty) placeholderWebTitle else webTitle

  override def toMap: Map[String, String] = Map(
    "webUrl" -> webUrl.toString,
    "webTitle" -> dynamoSafeWebTitle,
    "sectionId" -> sectionId
  ) ++ composerUrl.map("composerUrl" -> _.toString)

  override def toDynamoMap: Map[String, DynamoElement] = Map(
    "webUrl" -> DbString(webUrl.toString),
    "webTitle" -> DbString(dynamoSafeWebTitle),
    "sectionId" -> DbString(sectionId)
  ) ++ composerUrl.map(c => "composerUrl" -> DbString(c.toString))
}

object DigitalUsageMetadata {
  implicit val reader: Reads[DigitalUsageMetadata] = Json.reads[DigitalUsageMetadata]
  implicit val writer: Writes[DigitalUsageMetadata] = Json.writes[DigitalUsageMetadata]
}
