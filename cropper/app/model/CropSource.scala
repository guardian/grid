package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class CropSizing(file: String, dimensions: Dimensions)

object CropSizing {
  implicit val cropSizingWrites: Writes[CropSizing] = Json.writes[CropSizing]
}

case class CropSource(uri: String, bounds: Bounds, aspectRatio: Option[String])

object CropSource {
  implicit val cropWrites: Writes[CropSource] = Json.writes[CropSource]
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
