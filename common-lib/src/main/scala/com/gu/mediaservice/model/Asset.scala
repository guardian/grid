package com.gu.mediaservice.model

import java.net.{URI, URL}
import play.api.libs.json._
import play.api.libs.functional.syntax._
import com.gu.mediaservice.lib.aws.S3Object


// FIXME: size, mimeType and dimensions not optional (must backfill first)
case class Asset(file: URI, size: Option[Long], mimeType: Option[MimeType], dimensions: Option[Dimensions], secureUrl: Option[URL] = None, orientationMetadata: Option[OrientationMetadata] = None)

object Asset {

  def fromS3Object(s3Object: S3Object, dims: Option[Dimensions], orientationMetadata: Option[OrientationMetadata] = None): Asset = {
    val userMetadata   = s3Object.metadata.userMetadata
    val objectMetadata = s3Object.metadata.objectMetadata

    Asset(
      file       = s3Object.uri,
      size       = Some(s3Object.size),
      mimeType   = objectMetadata.contentType,
      dimensions = dims,
      secureUrl  = None,
      orientationMetadata = orientationMetadata,
    )
  }

  implicit val assetReads: Reads[Asset] =
    ((__ \ "file").read[String].map(URI.create) ~
      (__ \ "size").readNullable[Long] ~
      (__ \ "mimeType").readNullable[MimeType] ~
      (__ \ "dimensions").readNullable[Dimensions] ~
      (__ \ "secureUrl").readNullable[String].map(_.map(new URL(_)))  ~
      (__ \ "orientationMetadata").readNullable[OrientationMetadata]
      )(Asset.apply _)

  implicit val assetWrites: Writes[Asset] =
    ((__ \ "file").write[String].contramap((_: URI).toString) ~
      (__ \ "size").writeNullable[Long] ~
      (__ \ "mimeType").writeNullable[MimeType] ~
      (__ \ "dimensions").writeNullable[Dimensions] ~
      (__ \ "secureUrl").writeNullable[String].contramap((_: Option[URL]).map(_.toString)) ~
      (__ \ "orientationMetadata").writeNullable[OrientationMetadata]
      )(unlift(Asset.unapply))
}

case class Dimensions(width: Int, height: Int)
object Dimensions {
  implicit val dimensionsReads: Reads[Dimensions] = Json.reads[Dimensions]
  implicit val dimensionsWrites: Writes[Dimensions] = Json.writes[Dimensions]
}

case class OrientationMetadata(exifOrientation: Option[Int]) {
  def flipsDimensions(): Boolean = exifOrientation.exists(OrientationMetadata.exifOrientationsWhichFlipWidthAndHeight.contains)

  def transformsImage(): Boolean = !exifOrientation.exists(OrientationMetadata.exifOrientationsWhichDoNotTransformTheImage.contains)

  def orientationCorrection(): Int = {
    exifOrientation match {
      case Some(6) => 90
      case Some(8) => -90
      case Some(3) => 180
      case _ => 0
    }
  }
}
object OrientationMetadata {
  private val exifOrientationsWhichDoNotTransformTheImage = Set(1)
  private val exifOrientationsWhichFlipWidthAndHeight = Set(6, 8)
  implicit val orientationFormat: OFormat[OrientationMetadata] = Json.format[OrientationMetadata]
}
