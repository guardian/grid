package com.gu.mediaservice.model

import play.api.libs.json._


case class UsageReference(
  `type`: String,
  uri: Option[String] = None,
  name: Option[String] = None
)
object UsageReference {
  implicit val writes: Writes[UsageReference] = Json.writes[UsageReference]
  implicit val reads: Reads[UsageReference] = Json.reads[UsageReference]
}
