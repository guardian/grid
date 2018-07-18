package com.gu.mediaservice.model

import play.api.libs.json._

case class Album(
  title: String
)

object Album {
  implicit val reads: Reads[Album] = Json.reads[Album]
  implicit val writes: Writes[Album] = Json.writes[Album]
}
