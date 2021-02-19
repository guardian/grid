package com.gu.mediaservice.lib.config

import play.api.libs.json._

case class FileMetadataConfig(tag: String, visible: Boolean = false, searchable: Boolean = false, alias: Option[String])

object FileMetadataConfig {
  implicit val fileMetadataConfigJsonFormat = Json.format[FileMetadataConfig]
}