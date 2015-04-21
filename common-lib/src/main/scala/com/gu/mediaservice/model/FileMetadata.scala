package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class FileMetadata(
  iptc: Map[String, String]    = Map(),
  exif: Map[String, String]    = Map(),
  exifSub: Map[String, String] = Map(),
  xmp: Map[String, String]     = Map(),
  getty: Map[String, String]   = Map()
)

object FileMetadata {
  implicit val ImageMetadataReads: Reads[FileMetadata] = Json.reads[FileMetadata]
}
