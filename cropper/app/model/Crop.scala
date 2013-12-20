package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class Crop(
  file: String,
  meta: CropMetadata,
  secureUrl: String
)

case class CropMetadata(source: String, x: Int, y: Int, dimensions: Dimensions)

object CropMetadata {
  implicit val cropMetadataWrites: Writes[CropMetadata] = Json.writes[CropMetadata]
}

case class Dimensions(width: Int, height: Int)

object Dimensions {

  implicit val DimensionsWrites: Writes[Dimensions] =
    ((__ \ "width").write[Int] ~ (__ \ "height").write[Int])(unlift(Dimensions.unapply))

}

object Crop {
  implicit val cropWrites: Writes[Crop] = Json.writes[Crop]
}
