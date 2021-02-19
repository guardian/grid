package com.gu.mediaservice.lib.config

import play.api.libs.functional.syntax._

case class FileMetadataConfig(
                               directory: String,
                               tag: String,
                               visible: Boolean = false,
                               searchable: Boolean = false,
                               alias: Option[String])

object FileMetadataConfig {
  import play.api.libs.json._
  implicit val MetadataConfigurationWrites: Writes[FileMetadataConfig] = (
    (__ \ "directory").write[String] ~
      (__ \ "tag").write[String] ~
      (__ \ "visible").write[Boolean] ~
      (__ \ "searchable").write[Boolean] ~
      (__ \ "alias").writeNullable[String]
    )(unlift(FileMetadataConfig.unapply))
}
