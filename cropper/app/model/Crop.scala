package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class Crop(
  source: String,
  x: Int,
  y: Int,
  dimensions: Dimensions,
  file: String,
  secureUrl: String
)

case class Dimensions(width: Int, height: Int)

object Dimensions {

  implicit val DimensionsWrites: Writes[Dimensions] =
    ((__ \ "width").write[Int] ~ (__ \ "height").write[Int])(unlift(Dimensions.unapply))

}

object Crop {

  implicit val cropWrites: Writes[Crop] =
    ((__ \ "source").write[String] ~
     (__ \ "x").write[Int] ~
     (__ \ "y").write[Int] ~
     (__ \ "dimensions").write[Dimensions] ~
     (__ \ "file").write[String] ~
     (__ \ "secureUrl").write[String]
    )(unlift(Crop.unapply))

}
