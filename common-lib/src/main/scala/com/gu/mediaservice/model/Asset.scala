package com.gu.mediaservice.model

import java.net.{URI, URL}
import play.api.libs.json._
import play.api.libs.functional.syntax._
import com.gu.mediaservice.lib.aws.S3Object


// FIXME: size, mimeType and dimensions not optional (must backfill first)
case class Asset(file: URI, size: Option[Long], mimeType: Option[MimeType], dimensions: Option[Dimensions], secureUrl: Option[URL] = None)

object Asset {

  def fromS3Object(s3Object: S3Object, dims: Option[Dimensions]): Asset = {
    val userMetadata   = s3Object.metadata.userMetadata
    val objectMetadata = s3Object.metadata.objectMetadata

    Asset(
      file       = s3Object.uri,
      size       = Some(s3Object.size),
      mimeType   = objectMetadata.contentType,
      dimensions = dims,
      secureUrl  = None
    )
  }

  implicit val assetReads: Reads[Asset] =
    ((__ \ "file").read[String].map(URI.create) ~
      (__ \ "size").readNullable[Long] ~
      (__ \ "mimeType").readNullable[MimeType] ~
      (__ \ "dimensions").readNullable[Dimensions] ~
      (__ \ "secureUrl").readNullable[String].map(_.map(new URL(_)))
      )(Asset.apply _)

  implicit val assetWrites: Writes[Asset] =
    ((__ \ "file").write[String].contramap((_: URI).toString) ~
      (__ \ "size").writeNullable[Long] ~
      (__ \ "mimeType").writeNullable[MimeType] ~
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

