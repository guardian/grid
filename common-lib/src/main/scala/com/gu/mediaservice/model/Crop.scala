package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._

import org.joda.time.DateTime
import JodaReads._

//FIXME: Both id and file size here should not be an Option and are awaiting backfilling the correct data in ES

case class Crop(id: Option[String], author: Option[String], date: Option[DateTime], specification: CropSpec, master: Option[Asset], assets: List[Asset])
object Crop {
  import com.gu.mediaservice.lib.formatting._

  def getCropId(b: Bounds) = List(b.x, b.y, b.width, b.height).mkString("_")

  def createFromCropSource(by: Option[String], timeRequested: Option[DateTime], specification: CropSpec, master: Option[Asset] = None, cropSizings: List[Asset] = Nil): Crop =
    Crop(Some(getCropId(specification.bounds)), by, timeRequested, specification, master, cropSizings)

  def createFromCrop(crop: Crop, master: Asset, assets: List[Asset]): Crop =
    Crop(crop.id, crop.author, crop.date, crop.specification, Some(master), assets)

  implicit val cropReads: Reads[Crop] = (
    (__ \ "id").readNullable[String] ~
    (__ \ "author").readNullable[String] ~
    (__ \ "date").readNullable[DateTime] ~
    (__ \ "specification").read[CropSpec] ~
    (__ \ "master").readNullable[Asset] ~
    (__ \ "assets").read[List[Asset]]
  )(Crop.apply _)

  implicit val cropWrites: Writes[Crop] = (
    (__ \ "id").writeNullable[String] ~
    (__ \ "author").writeNullable[String] ~
    (__ \ "date").writeNullable[String].contramap(printOptDateTime) ~
    (__ \ "specification").write[CropSpec] ~
    (__ \ "master").writeNullable[Asset] ~
    (__ \ "assets").write[List[Asset]]
  )(unlift(Crop.unapply))
}


sealed trait ExportType { val name: String }
case object CropExport extends ExportType { val name = "crop" }
case object FullExport extends ExportType { val name = "full" }

object ExportType {

  val default = CropExport

  def valueOf(name: String): ExportType = name match {
    case "crop" => CropExport
    case "full" => FullExport
  }

  implicit val exportTypeWrites: Writes[ExportType] = Writes[ExportType](t => JsString(t.name))
  implicit val exportTypeReads: Reads[ExportType] = __.read[String].map(valueOf)
}


case class CropSpec(uri: String, bounds: Bounds, aspectRatio: Option[String], `type`: ExportType = ExportType.default)

object CropSpec {

  implicit val cropSpecWrites: Writes[CropSpec] = Json.writes[CropSpec]
  implicit val cropSpecReads: Reads[CropSpec] = (
    (__ \ "uri").read[String] ~
    (__ \ "bounds").read[Bounds] ~
    (__ \ "aspectRatio").readNullable[String] ~
    (__ \ "type").readNullable[ExportType].map(_.getOrElse(ExportType.default))
  )(CropSpec.apply _)
}


case class Bounds(x: Int, y: Int, width: Int, height: Int) {
  def isPortrait: Boolean = width < height
}

object Bounds {
  implicit val boundsWrites: Writes[Bounds] = Json.writes[Bounds]
  implicit val boundsReads: Reads[Bounds] = Json.reads[Bounds]
}
