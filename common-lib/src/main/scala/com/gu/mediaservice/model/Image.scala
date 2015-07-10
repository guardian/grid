package com.gu.mediaservice.model

import org.joda.time.DateTime
import play.api.libs.functional.syntax._
import play.api.libs.json._


case class Image(
  id:                  String,
  uploadTime:          DateTime,
  uploadedBy:          String,
  lastModified:        Option[DateTime],
  identifiers:         Map[String, String],
  source:              Asset,
  thumbnail:           Option[Asset],
  fileMetadata:        FileMetadata,
  userMetadata:        Option[Edits],
  metadata:            ImageMetadata,
  originalMetadata:    ImageMetadata,
  usageRights:         UsageRights,
  originalUsageRights: UsageRights,
  exports:             List[Crop]
)

object Image {

  import com.gu.mediaservice.lib.formatting._
  implicit val dateTimeFormat = DateFormat

  // FIXME: many fields made nullable to accomodate for legacy data that pre-dates them.
  // We should migrate the data for better consistency so nullable can be retired.
  implicit val ImageReads: Reads[Image] = (
    (__ \ "id").read[String] ~
      (__ \ "uploadTime").read[String].map(unsafeParseDateTime) ~
      (__ \ "uploadedBy").read[String] ~
      (__ \ "lastModified").readNullable[String].map(parseOptDateTime) ~
      (__ \ "identifiers").readNullable[Map[String, String]].map(_ getOrElse Map()) ~
      (__ \ "source").read[Asset] ~
      (__ \ "thumbnail").readNullable[Asset] ~
      (__ \ "fileMetadata").readNullable[FileMetadata].map(_ getOrElse FileMetadata()) ~
      (__ \ "userMetadata").readNullable[Edits] ~
      (__ \ "metadata").read[ImageMetadata] ~
      (__ \ "originalMetadata").readNullable[ImageMetadata].map(_ getOrElse ImageMetadata()) ~
      (__ \ "usageRights").readNullable[UsageRights].map(_ getOrElse NoRights) ~
      (__ \ "originalUsageRights").readNullable[UsageRights].map(_ getOrElse NoRights) ~
      (__ \ "exports").readNullable[List[Crop]].map(_ getOrElse List())
    )(Image.apply _)

  implicit val ImageWrites: Writes[Image] = (
    (__ \ "id").write[String] ~
      (__ \ "uploadTime").write[String].contramap(printDateTime) ~
      (__ \ "uploadedBy").write[String] ~
      (__ \ "lastModified").writeNullable[String].contramap(printOptDateTime) ~
      (__ \ "identifiers").write[Map[String, String]] ~
      (__ \ "source").write[Asset] ~
      (__ \ "thumbnail").writeNullable[Asset] ~
      (__ \ "fileMetadata").write[FileMetadata] ~
      (__ \ "userMetadata").writeNullable[Edits] ~
      (__ \ "metadata").write[ImageMetadata] ~
      (__ \ "originalMetadata").write[ImageMetadata] ~
      (__ \ "usageRights").write[UsageRights] ~
      (__ \ "originalUsageRights").write[UsageRights] ~
      (__ \ "exports").write[List[Crop]]
    )(unlift(Image.unapply))

}

