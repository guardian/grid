package com.gu.mediaservice.model

import play.api.libs.json._

case class Photoshoot(
  title: String
)

object Photoshoot {
  implicit val reads: Reads[Photoshoot] = Json.reads[Photoshoot]
  implicit val writes: Writes[Photoshoot] = Json.writes[Photoshoot]
}
