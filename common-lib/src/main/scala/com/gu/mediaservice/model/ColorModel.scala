package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._


case class ColorModel(id: String)
object ColorModel {
  implicit val ColorModelReads: Reads[ColorModel] = Json.reads[ColorModel]
  implicit val ColorModelWrites: Writes[ColorModel] = Json.writes[ColorModel]

  val default = ColorModel("RGB")
}
