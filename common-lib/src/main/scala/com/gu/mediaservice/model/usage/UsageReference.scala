package com.gu.mediaservice.model

import java.net.URI

import play.api.libs.json._
import com.gu.mediaservice.syntax._

case class UsageReference(
  `type`: String,
  uri: Option[URI] = None,
  name: Option[String] = None
)
object UsageReference {
  implicit val writes: Writes[UsageReference] = Json.writes[UsageReference]
  implicit val reads: Reads[UsageReference] = Json.reads[UsageReference]
}
