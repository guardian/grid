package com.gu.mediaservice.lib.config

import play.api.ConfigLoader
import play.api.libs.json._

import scala.collection.JavaConverters._

case class FieldAliasConfig(elasticsearchPath: String,
                            label: String,
                            displaySearchHint: Boolean = false,
                            alias: String)

object FieldAliasConfig {
  implicit val FieldAliasConfigWrites: Writes[FieldAliasConfig] =
    Json.writes[FieldAliasConfig]

  implicit val configLoader: ConfigLoader[Seq[FieldAliasConfig]] =
    ConfigLoader(_.getConfigList).map(
      _.asScala.map(
        config =>
          FieldAliasConfig(config.getString("elasticsearchPath"),
                           config.getString("label"),
                           config.getBoolean("displaySearchHint"),
                           config.getString("alias")))
    )
}
