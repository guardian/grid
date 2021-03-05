package com.gu.mediaservice.lib.config

import play.api.ConfigLoader
import play.api.libs.json._

import scala.collection.JavaConverters._

case class FieldAlias(elasticsearchPath: String,
                      label: String,
                      displaySearchHint: Boolean = false,
                      alias: String)

object FieldAlias {
  implicit val FieldAliasWrites: Writes[FieldAlias] =
    Json.writes[FieldAlias]

  implicit val configLoader: ConfigLoader[Seq[FieldAlias]] =
    ConfigLoader(_.getConfigList).map(
      _.asScala.map(
        config =>
          FieldAlias(config.getString("elasticsearchPath"),
            config.getString("label"),
            config.getBoolean("displaySearchHint"),
            config.getString("alias")))
    )
}
