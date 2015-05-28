package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._

import org.joda.time.DateTime


case class Export(
  id: String,
  author: Option[String],
  date: Option[DateTime],
  specification: CropSource,
  master: Option[Asset],
  assets: List[Asset],
  exportType: String
)

object Export {
  import com.gu.mediaservice.lib.formatting._
  implicit val dateTimeFormat = DateFormat

  def fromCrop(crop: Crop): Export = Export(
      crop.id,
      crop.author,
      crop.date,
      crop.specification,
      crop.master,
      crop.assets,
      "crop"
  )

  implicit val exportWrites: Writes[Export] = (
    (__ \ "id").write[String] ~
    (__ \ "author").writeNullable[String] ~
    (__ \ "date").writeNullable[String].contramap(printOptDateTime) ~
    (__ \ "specification").write[CropSource] ~
    (__ \ "master").writeNullable[Asset] ~
    (__ \ "assets").write[List[Asset]] ~
    (__ \ "type").write[String]
  )(unlift(Export.unapply))

}
