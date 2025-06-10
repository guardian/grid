package com.gu.mediaservice.model

import java.net.{URI, URL}
import play.api.libs.json._
import play.api.libs.functional.syntax._
import com.gu.mediaservice.lib.aws.S3Object


// FIXME: size, mimeType and dimensions not optional (must backfill first)
case class Asset(file: URI, size: Option[Long], mimeType: Option[MimeType], dimensions: Option[Dimensions], secureUrl: Option[URL] = None,
                 orientationMetadata: Option[OrientationMetadata] = None,
                 orientedDimensions: Option[Dimensions] = None,
                 orientation: Option[String] = None
                )

object Asset {

  def fromS3Object(s3Object: S3Object, dims: Option[Dimensions],
                   orientationMetadata: Option[OrientationMetadata] = None): Asset = {
    val userMetadata   = s3Object.metadata.userMetadata
    val objectMetadata = s3Object.metadata.objectMetadata

    val orientedDimensions = for {
      dimensions <- dims
      orientationMetadata <- orientationMetadata
    } yield {
      orientationMetadata.correctedDimensions(dimensions)
    }

    val maybeCorrectedOrientation = for {
      dimensions <- dims
      orientationMetadata <- orientationMetadata
    } yield {
      orientationMetadata.correctedOrientation(dimensions)
    }

    val maybeDimensionsOrientation = for {
      dimensions <- dims
    } yield {
      if (dimensions.width < dimensions.height) {
        "portrait"
      } else {
        "landscape"
      }
    }

    val maybeOrientation = Seq(maybeCorrectedOrientation, maybeDimensionsOrientation).flatten.headOption

    Asset(
      file       = s3Object.uri,
      size       = Some(s3Object.size),
      mimeType   = objectMetadata.contentType,
      dimensions = dims,
      secureUrl  = None,
      orientationMetadata = orientationMetadata,
      orientedDimensions = orientedDimensions,
      orientation = maybeOrientation
    )
  }

  implicit val assetReads: Reads[Asset] =
    ((__ \ "file").read[String].map(URI.create) ~
      (__ \ "size").readNullable[Long] ~
      (__ \ "mimeType").readNullable[MimeType] ~
      (__ \ "dimensions").readNullable[Dimensions] ~
      (__ \ "secureUrl").readNullable[String].map(_.map(new URL(_)))  ~
      (__ \ "orientationMetadata").readNullable[OrientationMetadata] ~
      (__ \ "orientedDimensions").readNullable[Dimensions] ~
      (__ \ "orientation").readNullable[String]
      )(Asset.apply _)

  implicit val assetWrites: Writes[Asset] =
    ((__ \ "file").write[String].contramap((_: URI).toString) ~
      (__ \ "size").writeNullable[Long] ~
      (__ \ "mimeType").writeNullable[MimeType] ~
      (__ \ "dimensions").writeNullable[Dimensions] ~
      (__ \ "secureUrl").writeNullable[String].contramap((_: Option[URL]).map(_.toString)) ~
      (__ \ "orientationMetadata").writeNullable[OrientationMetadata] ~
      (__ \ "orientedDimensions").writeNullable[Dimensions] ~
      (__ \ "orientation").writeNullable[String]
      )(unlift(Asset.unapply))
}

case class Dimensions(width: Int, height: Int)
object Dimensions {
  implicit val dimensionsReads: Reads[Dimensions] = Json.reads[Dimensions]
  implicit val dimensionsWrites: Writes[Dimensions] = Json.writes[Dimensions]
}

case class OrientationMetadata(exifOrientation: Option[Int]) {

  def transformsImage(): Boolean = !exifOrientation.exists(OrientationMetadata.exifOrientationsWhichDoNotTransformTheImage.contains)

  def orientationCorrection(): Int = {
    exifOrientation match {
      case Some(6) => 90
      case Some(8) => -90
      case Some(3) => 180
      case _ => 0
    }
  }

  def correctedDimensions(sourceDimensions: Dimensions): Dimensions = {
    if (flipsDimensions()) {
      Dimensions(width = sourceDimensions.height, height = sourceDimensions.width)
    } else {
      sourceDimensions
    }
  }

  def correctedOrientation(sourceDimensions: Dimensions): String = {
    val orientedDimensions = correctedDimensions(sourceDimensions)
    if (orientedDimensions.width < orientedDimensions.height) {
      "portrait"
    } else {
      "landscape"
    }
  }

  private def flipsDimensions(): Boolean = exifOrientation.exists(OrientationMetadata.exifOrientationsWhichFlipWidthAndHeight.contains)

}

object OrientationMetadata {
  private val exifOrientationsWhichDoNotTransformTheImage = Set(1)
  private val exifOrientationsWhichFlipWidthAndHeight = Set(6, 8)
  implicit val orientationFormat: OFormat[OrientationMetadata] = Json.format[OrientationMetadata]
}
