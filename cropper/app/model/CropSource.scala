package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class Crop(id: String, specification: CropSource, assets: List[CropSizing])

object Crop {
  implicit val cropWrites: Writes[Crop] = Json.writes[Crop]
}

case class CropSizing(file: String, dimensions: Dimensions)

object CropSizing {
  implicit val cropSizingWrites: Writes[CropSizing] = Json.writes[CropSizing]
}

case class CropSource(uri: String, bounds: Bounds, aspectRatio: Option[String])

object CropSource {
  implicit val cropSourceWrites: Writes[CropSource] = Json.writes[CropSource]
}

case class Dimensions(width: Int, height: Int)

object Dimensions {
  implicit val dimensionsReads: Reads[Dimensions] = Json.reads[Dimensions]

  implicit val dimensionsWrites: Writes[Dimensions] =
    ((__ \ "width").write[Int] ~ (__ \ "height").write[Int])(unlift(Dimensions.unapply))
}

case class Bounds(x: Int, y: Int, width: Int, height: Int)

object Bounds {
  implicit val boundsWrites: Writes[Bounds] = Json.writes[Bounds]
}


// TODO: share in common lib
case class SourceImage(id: String, source: Asset)

object SourceImage {
  implicit val sourceImageReads: Reads[SourceImage] =
    ((__ \ "data" \ "id").read[String] ~ (__ \ "data" \ "source").read[Asset])(SourceImage.apply _)
}

case class Asset(file: String, dimensions: Dimensions, secureUrl: String)

object Asset {
  implicit val assetReads: Reads[Asset] =
    ((__ \ "file").read[String] ~ (__ \ "dimensions").read[Dimensions] ~ (__ \ "secureUrl").read[String])(Asset.apply _)
}
