package com.gu.mediaservice.model

import play.api.libs.json._

case class ImageStatusRecord(
                               id: String,
                               deletedBy: String,
                               deleteTime: String,
                               isDeleted: Boolean
                             )

object ImageStatusRecord {
  implicit val formats: Format[ImageStatusRecord] = Json.format[ImageStatusRecord]
}
//
//implicit val reads: Reads[Photoshoot] = Json.reads[Photoshoot]
//implicit val writes: Writes[Photoshoot] = Json.writes[Photoshoot]
