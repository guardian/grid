package com.gu.mediaservice.lib.config

import play.api.ConfigLoader
import play.api.libs.json._

import scala.collection.JavaConverters._

case class FieldAlias(elasticsearchPath: String,
                      label: String,
                      displayInAdditionalMetadata: Boolean,
                      displaySearchHint: Boolean,
                      alias: String,
                      searchHintOptions: List[String])

object FieldAlias {
  implicit val FieldAliasWrites: Writes[FieldAlias] =
    Json.writes[FieldAlias]

  implicit val configLoader: ConfigLoader[Seq[FieldAlias]] =
    ConfigLoader(_.getConfigList).map(
      _.asScala.map(
        config => {
          val displayInAdditionalMetadata = if (config.hasPath("displayInAdditionalMetadata"))
            config.getBoolean("displayInAdditionalMetadata") else true
          val displaySearchHint = if (config.hasPath("displaySearchHint"))
            config.getBoolean("displaySearchHint") else false
          val searchHintOptions = if (config.hasPath("searchHintOptions"))
            config.getStringList("searchHintOptions").asScala.toList.filter(_.nonEmpty) else List.empty

          FieldAlias(
            config.getString("elasticsearchPath"),
            config.getString("label"),
            displayInAdditionalMetadata,
            displaySearchHint,
            config.getString("alias"),
            searchHintOptions
          )
        }
      )
    )
}
