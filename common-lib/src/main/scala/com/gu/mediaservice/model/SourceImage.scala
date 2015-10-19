package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._


case class SourceImage(id: String, source: Asset, valid: Boolean, metadata: ImageMetadata, fileMetadata: FileMetadata)

object SourceImage {
  implicit val sourceImageReads: Reads[SourceImage] =
    ((__ \ "data" \ "id").read[String] ~
      (__ \ "data" \ "source").read[Asset] ~
      (__ \ "data" \ "valid").read[Boolean] ~
      (__ \ "data" \ "metadata").read[ImageMetadata] ~
      (__ \ "data" \ "fileMetadata" \ "data").read[FileMetadata]
      )(SourceImage.apply _)
}
