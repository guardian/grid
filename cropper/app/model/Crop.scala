package model

import play.api.libs.json._
import play.api.libs.functional.syntax._
import org.joda.time.DateTime

import com.gu.mediaservice.model.ImageMetadata

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

case class Dimensions(width: Int, height: Int)
object Dimensions {
  implicit val dimensionsReads: Reads[Dimensions] = Json.reads[Dimensions]

  implicit val dimensionsWrites: Writes[Dimensions] =
    ((__ \ "width").write[Int] ~ (__ \ "height").write[Int])(unlift(Dimensions.unapply))
}

case class Bounds(x: Int, y: Int, width: Int, height: Int) {
  def isPortrait: Boolean = width < height
}

object Bounds {
  implicit val boundsWrites: Writes[Bounds] = Json.writes[Bounds]
}


// TODO: share in common lib
case class SourceImage(id: String, source: Asset, valid: Boolean, metadata: ImageMetadata)
object SourceImage {
  implicit val sourceImageReads: Reads[SourceImage] =
    ((__ \ "data" \ "id").read[String] ~
      (__ \ "data" \ "source").read[Asset] ~
      (__ \ "data" \ "valid").read[Boolean] ~
      (__ \ "data" \ "metadata").read[ImageMetadata]
      )(SourceImage.apply _)
}

case class Asset(file: String, dimensions: Dimensions, secureUrl: String)

object Asset {
  implicit val assetReads: Reads[Asset] =
    ((__ \ "file").read[String] ~ (__ \ "dimensions").read[Dimensions] ~ (__ \ "secureUrl").read[String])(Asset.apply _)
}
