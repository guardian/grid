package com.gu.mediaservice.model

import com.gu.mediaservice.lib.formatting._
import org.joda.time.DateTime
import play.api.libs.functional.syntax._
import play.api.libs.json._

/* following are standard metadata fields that exist in multiple schemas,
most canonical being https://www.iptc.org/std/photometadata/specification/IPTC-PhotoMetadata */
case class ImageMetadata(
  dateTaken:           Option[DateTime] = None,
  description:         Option[String]   = None,
  credit:              Option[String]   = None,
  creditUri:           Option[String]   = None,
  byline:              Option[String]   = None,
  bylineTitle:         Option[String]   = None,
  title:               Option[String]   = None,
  copyright:           Option[String]   = None,
  suppliersReference:  Option[String]   = None,
  source:              Option[String]   = None,
  specialInstructions: Option[String]   = None,
  keywords:            List[String]     = Nil,
  subLocation:         Option[String]   = None,
  city:                Option[String]   = None,
  state:               Option[String]   = None,
  country:             Option[String]   = None,
  subjects:            List[String]     = Nil,
  peopleInImage:       Set[String]      = Set(),
) {
  def merge(that: ImageMetadata) = this.copy(
    dateTaken = (that.dateTaken ++ this.dateTaken).headOption,
    description = (that.description ++ this.description).headOption,
    credit = (that.credit ++ this.credit).headOption,
    creditUri = (that.creditUri ++ this.creditUri).headOption,
    byline = (that.byline ++ this.byline).headOption,
    bylineTitle = (that.bylineTitle ++ this.bylineTitle).headOption,
    title = (that.title ++ this.title).headOption,
    copyright = (that.copyright ++ this.copyright).headOption,
    suppliersReference = (that.suppliersReference ++ this.suppliersReference).headOption,
    source = (that.source ++ this.source).headOption,
    specialInstructions = (that.specialInstructions ++ this.specialInstructions).headOption,
    keywords = that.keywords ++ this.keywords,
    subLocation = (that.subLocation ++ this.subLocation).headOption,
    city = (that.city ++ this.city).headOption,
    state = (that.state ++ this.state).headOption,
    country = (that.country ++ this.country).headOption,
    subjects = that.subjects ++ this.subjects,
    peopleInImage = that.peopleInImage ++ this.peopleInImage
  )

}

object ImageMetadata {
  val empty = ImageMetadata()

  implicit val ImageMetadataReads: Reads[ImageMetadata] = (
    (__ \ "dateTaken").readNullable[String].map(_.flatMap(parseDateTime)) ~
      (__ \ "description").readNullable[String] ~
      (__ \ "credit").readNullable[String] ~
      (__ \ "creditUri").readNullable[String] ~
      (__ \ "byline").readNullable[String] ~
      (__ \ "bylineTitle").readNullable[String] ~
      (__ \ "title").readNullable[String] ~
      (__ \ "copyright").readNullable[String] ~
      (__ \ "suppliersReference").readNullable[String] ~
      (__ \ "source").readNullable[String] ~
      (__ \ "specialInstructions").readNullable[String] ~
      (__ \ "keywords").readNullable[List[String]].map(_ getOrElse Nil) ~
      (__ \ "subLocation").readNullable[String] ~
      (__ \ "city").readNullable[String] ~
      (__ \ "state").readNullable[String] ~
      (__ \ "country").readNullable[String] ~
      (__ \ "subjects").readNullable[List[String]].map(_ getOrElse Nil) ~
      (__ \ "peopleInImage").readNullable[Set[String]].map(_ getOrElse Set())
    )(ImageMetadata.apply _)

  implicit val IptcMetadataWrites: Writes[ImageMetadata] = (
    (__ \ "dateTaken").writeNullable[String].contramap(printOptDateTime) ~
      (__ \ "description").writeNullable[String] ~
      (__ \ "credit").writeNullable[String] ~
      (__ \ "creditUri").writeNullable[String] ~
      (__ \ "byline").writeNullable[String] ~
      (__ \ "bylineTitle").writeNullable[String] ~
      (__ \ "title").writeNullable[String] ~
      (__ \ "copyright").writeNullable[String] ~
      (__ \ "suppliersReference").writeNullable[String] ~
      (__ \ "source").writeNullable[String] ~
      (__ \ "specialInstructions").writeNullable[String] ~
      (__ \ "keywords").writeNullable[List[String]].contramap((l: List[String]) => if (l.isEmpty) None else Some(l)) ~
      (__ \ "subLocation").writeNullable[String] ~
      (__ \ "city").writeNullable[String] ~
      (__ \ "state").writeNullable[String] ~
      (__ \ "country").writeNullable[String] ~
      (__ \ "subjects").writeNullable[List[String]].contramap((l: List[String]) => if (l.isEmpty) None else Some(l)) ~
      (__ \ "peopleInImage").writeNullable[Set[String]].contramap((l: Set[String]) => if (l.isEmpty) None else Some(l))
    )(unlift(ImageMetadata.unapply))

}
