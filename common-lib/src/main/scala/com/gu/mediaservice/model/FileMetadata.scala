package com.gu.mediaservice.model

case class FileMetadata(iptc: Map[String, String],
                        exif: Map[String, String],
                        exifSub: Map[String, String],
                        xmp: Map[String, String]
)
