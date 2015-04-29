package com.gu.mediaservice.model

import org.joda.time.DateTime
import play.api.libs.functional.syntax._
import play.api.libs.json._

import com.gu.mediaservice.lib.formatting._

case class Image(
  id:                  String,
  uploadTime:          DateTime,
  uploadedBy:          String,
  lastModified:        Option[DateTime],
  identifiers:         Map[String, String],
  source:              Asset,
  thumbnail:           Option[Asset],
  fileMetadata:        FileMetadata,
  metadata:            ImageMetadata,
  originalMetadata:    ImageMetadata,
  usageRights:         ImageUsageRights,
  originalUsageRights: ImageUsageRights
)

object Image {

  implicit val ImageReads: Reads[Image] = (
    (__ \ "id").read[String] ~
      (__ \ "uploadTime").read[String].map(unsafeParseDateTime) ~
      (__ \ "uploadedBy").read[String] ~
      // FIXME: next two nullable - re-ingest all files into envs to backfill the data
      (__ \ "lastModified").readNullable[String].map(parseOptDateTime) ~
      (__ \ "identifiers").read[Map[String, String]] ~
      (__ \ "source").read[Asset] ~
      (__ \ "thumbnail").readNullable[Asset] ~
      // FIXME: fileMetadata can be null - re-ingest all files into envs to backfill the data
      (__ \ "fileMetadata").read[FileMetadata] ~
      (__ \ "metadata").read[ImageMetadata] ~
      // FIXME: three next nullable - re-ingest all files into envs to backfill the data
      (__ \ "originalMetadata").read[ImageMetadata] ~
      (__ \ "usageRights").read[ImageUsageRights] ~
      (__ \ "originalUsageRights").read[ImageUsageRights]
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
      (__ \ "metadata").write[ImageMetadata] ~
      (__ \ "originalMetadata").write[ImageMetadata] ~
      (__ \ "usageRights").write[ImageUsageRights] ~
      (__ \ "originalUsageRights").write[ImageUsageRights]
    )(unlift(Image.unapply))

}

