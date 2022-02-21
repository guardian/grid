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
  keywords:            Option[List[String]] = None,
  subLocation:         Option[String]   = None,
  city:                Option[String]   = None,
  state:               Option[String]   = None,
  country:             Option[String]   = None,
  subjects:            Option[List[String]] = None,
  peopleInImage:       Option[Set[String]] = None,
  domainMetadata:      Map[String, Map[String, JsValue]] = Map()
) {
  def merge(that: ImageMetadata) = this.copy(
    dateTaken = that.dateTaken orElse this.dateTaken,
    description = that.description orElse this.description,
    credit = that.credit orElse this.credit,
    creditUri = that.creditUri orElse this.creditUri,
    byline = that.byline orElse this.byline,
    bylineTitle = that.bylineTitle orElse this.bylineTitle,
    title = that.title orElse this.title,
    copyright = that.copyright orElse this.copyright,
    suppliersReference = that.suppliersReference orElse this.suppliersReference,
    source = that.source orElse this.source,
    specialInstructions = that.specialInstructions orElse this.specialInstructions,
    keywords = that.keywords orElse this.keywords,
    subLocation = that.subLocation orElse this.subLocation,
    city = that.city orElse this.city,
    state = that.state orElse this.state,
    country = that.country orElse this.country,
    subjects = that.subjects orElse this.subjects,
    peopleInImage = that.peopleInImage orElse this.peopleInImage,
    domainMetadata = that.domainMetadata ++ this.domainMetadata
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
      (__ \ "keywords").readNullable[List[String]] ~
      (__ \ "subLocation").readNullable[String] ~
      (__ \ "city").readNullable[String] ~
      (__ \ "state").readNullable[String] ~
      (__ \ "country").readNullable[String] ~
      (__ \ "subjects").readNullable[List[String]] ~
      (__ \ "peopleInImage").readNullable[Set[String]] ~
      (__ \ "domainMetadata").readNullable[Map[String, Map[String, JsValue]]].map(_ getOrElse Map())
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
      (__ \ "keywords").writeNullable[List[String]] ~
      (__ \ "subLocation").writeNullable[String] ~
      (__ \ "city").writeNullable[String] ~
      (__ \ "state").writeNullable[String] ~
      (__ \ "country").writeNullable[String] ~
      (__ \ "subjects").writeNullable[List[String]] ~
      (__ \ "peopleInImage").writeNullable[Set[String]] ~
      (__ \ "domainMetadata").writeNullable[Map[String, Map[String, JsValue]]].contramap((l: Map[String, Map[String, JsValue]]) => if (l.isEmpty) None else Some(l))
    )(unlift(ImageMetadata.unapply))

}
