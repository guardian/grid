package com.gu.mediaservice.model

import play.api.libs.json._

case class ImageStatusRecord(
                               id: String,
                               deletedBy: String,
                               deleteTime: String,
                               isDeleted: Boolean,
                               instance: String
                             )

object ImageStatusRecord {
  implicit val formats: Format[ImageStatusRecord] = Json.format[ImageStatusRecord]
}
