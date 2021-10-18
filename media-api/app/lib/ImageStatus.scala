package lib

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
