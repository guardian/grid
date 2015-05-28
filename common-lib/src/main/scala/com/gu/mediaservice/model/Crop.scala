package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._

import org.joda.time.DateTime


case class Crop(id: Option[String], author: Option[String], date: Option[DateTime], specification: CropSource, master: Option[Asset], assets: List[Asset])
object Crop {
  import com.gu.mediaservice.lib.formatting._
  implicit val dateTimeFormat = DateFormat

  def getCropId(b: Bounds) = List(b.x, b.y, b.width, b.height).mkString("_")

  def createFromCropSource(by: Option[String], timeRequested: Option[DateTime], specification: CropSource, master: Option[Asset] = None, cropSizings: List[Asset] = Nil): Crop =
    Crop(Some(getCropId(specification.bounds)), by, timeRequested, specification, master, cropSizings)

  def createFromCrop(crop: Crop, master: Asset, assets: List[Asset]): Crop =
    Crop(crop.id, crop.author, crop.date, crop.specification, Some(master), assets)

  implicit val cropReads: Reads[Crop] = (
    (__ \ "id").readNullable[String] ~
    (__ \ "author").readNullable[String] ~
    (__ \ "date").readNullable[DateTime] ~
    (__ \ "specification").read[CropSource] ~
    (__ \ "master").readNullable[Asset] ~
    (__ \ "assets").read[List[Asset]]
  )(Crop.apply _)

  implicit val cropWrites: Writes[Crop] = (
    (__ \ "id").writeNullable[String] ~
    (__ \ "author").writeNullable[String] ~
    (__ \ "date").writeNullable[String].contramap(printOptDateTime) ~
    (__ \ "specification").write[CropSource] ~
    (__ \ "master").writeNullable[Asset] ~
    (__ \ "assets").write[List[Asset]]
  )(unlift(Crop.unapply))
}

case class CropSource(uri: String, bounds: Bounds, aspectRatio: Option[String])
object CropSource {
  implicit val cropSourceWrites: Writes[CropSource] = Json.writes[CropSource]
  implicit val cropSourceReads: Reads[CropSource] = Json.reads[CropSource]
}

case class Bounds(x: Int, y: Int, width: Int, height: Int) {
  def isPortrait: Boolean = width < height
}

object Bounds {
  implicit val boundsWrites: Writes[Bounds] = Json.writes[Bounds]
  implicit val boundsReads: Reads[Bounds] = Json.reads[Bounds]
}
