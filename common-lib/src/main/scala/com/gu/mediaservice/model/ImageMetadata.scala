package com.gu.mediaservice.model

import com.gu.mediaservice.lib.formatting._
import org.joda.time.DateTime
import play.api.libs.functional.syntax._
import play.api.libs.json._

case class ImageMetadata(
  dateTaken:           Option[DateTime],
  description:         Option[String],
  credit:              Option[String],
  byline:              Option[String],
  bylineTitle:         Option[String],
  title:               Option[String],
  copyrightNotice:     Option[String],
  copyright:           Option[String],
  supplier:            Option[String],
  collection:          Option[String],
  suppliersReference:  Option[String],
  source:              Option[String],
  specialInstructions: Option[String],
  keywords:            List[String],
  subLocation:         Option[String],
  city:                Option[String],
  state:               Option[String],
  country:             Option[String]
)

object ImageMetadata {
  implicit val ImageMetadataReads: Reads[ImageMetadata] = (
    (__ \ "dateTaken").readNullable[String].map(_.flatMap(parseDateTime)) ~
      (__ \ "description").readNullable[String] ~
      (__ \ "credit").readNullable[String] ~
      (__ \ "byline").readNullable[String] ~
      (__ \ "bylineTitle").readNullable[String] ~
      (__ \ "title").readNullable[String] ~
      (__ \ "copyrightNotice").readNullable[String] ~
      (__ \ "copyright").readNullable[String] ~
      (__ \ "supplier").readNullable[String] ~
      (__ \ "collection").readNullable[String] ~
      (__ \ "suppliersReference").readNullable[String] ~
      (__ \ "source").readNullable[String] ~
      (__ \ "specialInstructions").readNullable[String] ~
      (__ \ "keywords").readNullable[List[String]].map(_ getOrElse Nil) ~
      (__ \ "subLocation").readNullable[String] ~
      (__ \ "city").readNullable[String] ~
      (__ \ "state").readNullable[String] ~
      (__ \ "country").readNullable[String]
    )(ImageMetadata.apply _)

  implicit val IptcMetadataWrites: Writes[ImageMetadata] = (
    (__ \ "dateTaken").writeNullable[String].contramap(printOptDateTime) ~
      (__ \ "description").writeNullable[String] ~
      (__ \ "credit").writeNullable[String] ~
      (__ \ "byline").writeNullable[String] ~
      (__ \ "bylineTitle").writeNullable[String] ~
      (__ \ "title").writeNullable[String] ~
      (__ \ "copyrightNotice").writeNullable[String] ~
      (__ \ "copyright").writeNullable[String] ~
      (__ \ "supplier").writeNullable[String] ~
      (__ \ "collection").writeNullable[String] ~
      (__ \ "suppliersReference").writeNullable[String] ~
      (__ \ "source").writeNullable[String] ~
      (__ \ "specialInstructions").writeNullable[String] ~
      (__ \ "keywords").write[List[String]] ~
      (__ \ "subLocation").writeNullable[String] ~
      (__ \ "city").writeNullable[String] ~
      (__ \ "state").writeNullable[String] ~
      (__ \ "country").writeNullable[String]
    )(unlift(ImageMetadata.unapply))

}
