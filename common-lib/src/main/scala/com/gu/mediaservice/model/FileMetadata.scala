package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class FileMetadata(iptc: Map[String, String],
                        exif: Map[String, String],
                        exifSub: Map[String, String],
                        xmp: Map[String, String],
                        getty: Map[String, String]
)

object FileMetadata {
  implicit val ImageMetadataReads: Reads[FileMetadata] = Json.reads[FileMetadata]
}
