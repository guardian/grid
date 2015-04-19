package com.gu.mediaservice.model

import java.net.{URI, URL}
import play.api.libs.json._
import play.api.libs.functional.syntax._
import com.gu.mediaservice.lib.aws.S3Object

case class Asset(file: URI, size: Long, mimeType: Option[String], dimensions: Option[Dimensions], secureUrl: Option[URL] = None)
object Asset {

  def fromS3Object(s3Object: S3Object, dimensions: Option[Dimensions]): Asset = {
    val userMetadata   = s3Object.metadata.userMetadata
    val objectMetadata = s3Object.metadata.objectMetadata

    Asset(
      s3Object.uri,
      s3Object.size,
      objectMetadata.contentType,
      dimensions,
      None
    )
  }

  implicit val assetReads: Reads[Asset] =
    ((__ \ "file").read[String].map(URI.create(_)) ~
      (__ \ "size").read[Long] ~
      (__ \ "mimeType").readNullable[String] ~
      (__ \ "dimensions").readNullable[Dimensions] ~
      (__ \ "secureUrl").readNullable[String].map(_.map(new URL(_)))
      )(Asset.apply _)

  implicit val assetWrites: Writes[Asset] =
    ((__ \ "file").write[String].contramap((_: URI).toString) ~
      (__ \ "size").write[Long] ~
      (__ \ "mimeType").writeNullable[String] ~
      (__ \ "dimensions").writeNullable[Dimensions] ~
      (__ \ "secureUrl").writeNullable[String].contramap((_: Option[URL]).map(_.toString))
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

