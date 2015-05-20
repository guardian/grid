package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._


case class FileMetadata(
  iptc: Map[String, String]      = Map(),
  exif: Map[String, String]      = Map(),
  exifSub: Map[String, String]   = Map(),
  xmp: Map[String, String]       = Map(),
  icc: Map[String, String]       = Map(),
  getty: Map[String, String]     = Map(),
  colorModel: Option[ColorModel] = None
)

object FileMetadata {
  // TODO: reindex all images to make the getty map always present
  // for data consistency, so we can fallback to use the default Reads
  implicit val ImageMetadataReads: Reads[FileMetadata] = (
    (__ \ "iptc").read[Map[String,String]] ~
    (__ \ "exif").read[Map[String,String]] ~
    (__ \ "exifSub").read[Map[String,String]] ~
    (__ \ "xmp").read[Map[String,String]] ~
    (__ \ "icc").readNullable[Map[String,String]].map(_ getOrElse Map()) ~
    (__ \ "getty").readNullable[Map[String,String]].map(_ getOrElse Map()) ~
    (__ \ "colorModel").readNullable[ColorModel]
  )(FileMetadata.apply _)

  implicit val FileMetadataWrites: Writes[FileMetadata] = Json.writes[FileMetadata]
}
