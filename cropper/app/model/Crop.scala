package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

import org.joda.time.DateTime
import com.gu.mediaservice.model.{Dimensions, ImageMetadata, Asset}

case class Crop(id: String, author: Option[String], date: Option[DateTime], specification: CropSource, master: Option[CropSizing], assets: List[CropSizing])
object Crop {
  import com.gu.mediaservice.lib.formatting._

  def getCropId(b: Bounds) = List(b.x, b.y, b.width, b.height).mkString("_")

  def apply(by: Option[String], timeRequested: Option[DateTime], specification: CropSource, master: Option[CropSizing] = None, cropSizings: List[CropSizing] = Nil): Crop =
    Crop(getCropId(specification.bounds), by, timeRequested, specification, master, cropSizings)

  def apply(crop: Crop, master: CropSizing, assets: List[CropSizing]): Crop =
    Crop(crop.id, crop.author, crop.date, crop.specification, Some(master), assets)

  implicit val cropWrites: Writes[Crop] = (
    (__ \ "id").write[String] ~
    (__ \ "author").writeNullable[String] ~
    (__ \ "date").writeNullable[String].contramap(printOptDateTime) ~
    (__ \ "specification").write[CropSource] ~
    (__ \ "master").writeNullable[CropSizing] ~
    (__ \ "assets").write[List[CropSizing]]
  )(unlift(Crop.unapply))
}

case class CropSizing(file: String, dimensions: Dimensions)
object CropSizing {
  implicit val cropSizingWrites: Writes[CropSizing] = Json.writes[CropSizing]
}

case class CropSource(uri: String, bounds: Bounds, aspectRatio: Option[String])
object CropSource {
  implicit val cropSourceWrites: Writes[CropSource] = Json.writes[CropSource]
}

case class Bounds(x: Int, y: Int, width: Int, height: Int) {
  def isPortrait: Boolean = width < height
}

object Bounds {
  implicit val boundsWrites: Writes[Bounds] = Json.writes[Bounds]
}
