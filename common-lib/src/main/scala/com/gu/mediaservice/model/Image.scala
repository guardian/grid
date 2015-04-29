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

  implicit val FileMetadataWrites: Writes[FileMetadata] = Json.writes[FileMetadata]

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

