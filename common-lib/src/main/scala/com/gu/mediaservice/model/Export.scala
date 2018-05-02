package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._

import org.joda.time.DateTime


case class Export(
  id: Option[String],
  author: Option[String],
  date: Option[DateTime],
  specification: CropSpec,
  master: Option[Asset],
  assets: List[Asset]
)

object Export {
  import com.gu.mediaservice.lib.formatting._

  def fromCrop(crop: Crop): Export = Export(
      crop.id,
      crop.author,
      crop.date,
      crop.specification,
      crop.master,
      crop.assets
  )

  implicit val exportWrites: Writes[Export] = (
    (__ \ "id").writeNullable[String] ~
    (__ \ "author").writeNullable[String] ~
    (__ \ "date").writeNullable[String].contramap(printOptDateTime) ~
    (__ \ "specification").write[CropSpec] ~
    (__ \ "master").writeNullable[Asset] ~
    (__ \ "assets").write[List[Asset]]
  )(unlift(Export.unapply))

}
