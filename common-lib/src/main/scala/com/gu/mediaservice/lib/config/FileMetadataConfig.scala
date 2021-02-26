package com.gu.mediaservice.lib.config

import play.api.ConfigLoader
import play.api.libs.json._

import scala.collection.JavaConverters._

case class FileMetadataConfig(
                               elasticsearchPath: String,
                               label: String,
                               displaySearchHint: Boolean = false,
                               alias: String)

object FileMetadataConfig {
  implicit val MetadataConfigurationWrites: Writes[FileMetadataConfig] = Json.writes[FileMetadataConfig]

  implicit val configLoader: ConfigLoader[Seq[FileMetadataConfig]] = ConfigLoader(_.getConfigList).map (
    _.asScala.map(config =>
      FileMetadataConfig(
        config.getString("elasticsearchPath"),
        config.getString("label"),
        config.getBoolean("displaySearchHint"),
        alias = config.getString("alias")
      )
    )
  )
}
