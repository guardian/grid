package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class CropSizing(
  file: String,
  source: Crop,
  dimensions: Dimensions,
  secureUrl: Option[String]
)

object CropSizing {
  implicit val cropSizingWrites: Writes[CropSizing] = Json.writes[CropSizing]
}

case class Crop(source: String, bounds: Bounds)

object Crop {
  implicit val cropWrites: Writes[Crop] = Json.writes[Crop]
}

case class Dimensions(width: Int, height: Int)

object Dimensions {
  implicit val DimensionsWrites: Writes[Dimensions] =
    ((__ \ "width").write[Int] ~ (__ \ "height").write[Int])(unlift(Dimensions.unapply))
}

case class Bounds(x: Int, y: Int, width: Int, height: Int)

object Bounds {
  implicit val boundsWrites: Writes[Bounds] = Json.writes[Bounds]
}
