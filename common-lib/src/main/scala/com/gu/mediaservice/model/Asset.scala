package com.gu.mediaservice.model

import java.net.URI
import play.api.libs.json._
import play.api.libs.functional.syntax._


case class Asset(file: URI, size: Long, mimeType: Option[String], dimensions: Option[Dimensions])
object Asset {

  implicit val assetReads: Reads[Asset] =
    ((__ \ "file").read[String].map(URI.create(_)) ~
      (__ \ "size").read[Long] ~
      (__ \ "mimeType").readNullable[String] ~
      (__ \ "dimensions").readNullable[Dimensions]
      )(Asset.apply _)

  implicit val assetWrites: Writes[Asset] =
    ((__ \ "file").write[String].contramap((_: URI).toString) ~
      (__ \ "size").write[Long] ~
      (__ \ "mimeType").writeNullable[String] ~
      (__ \ "dimensions").writeNullable[Dimensions]
      )(unlift(Asset.unapply))

}

case class Dimensions(width: Int, height: Int)
object Dimensions {
  implicit val dimensionsReads: Reads[Dimensions] = Json.reads[Dimensions]
  implicit val dimensionsWrites: Writes[Dimensions] =
    ((__ \ "width").write[Int] ~
      (__ \ "height").write[Int]
      )(unlift(Dimensions.unapply))
}

