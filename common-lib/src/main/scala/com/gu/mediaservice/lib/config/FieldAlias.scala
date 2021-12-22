package com.gu.mediaservice.lib.config

import play.api.ConfigLoader
import play.api.libs.json._

import scala.collection.JavaConverters._

case class FieldAlias(elasticsearchPath: String,
                      label: String,
                      displaySearchHint: Boolean = false,
                      alias: String,
                      searchHintOptions: List[String] = List.empty)

object FieldAlias {
  implicit val FieldAliasWrites: Writes[FieldAlias] =
    Json.writes[FieldAlias]

  implicit val configLoader: ConfigLoader[Seq[FieldAlias]] =
    ConfigLoader(_.getConfigList).map(
      _.asScala.map(
        config => {
          val displaySearchHint = if (config.hasPath("displaySearchHint"))
            config.getBoolean("displaySearchHint") else false
          val searchHintOptions = if (config.hasPath("searchHintOptions"))
            config.getStringList("searchHintOptions").asScala.toList.filter(_.nonEmpty) else List.empty

          FieldAlias(
            config.getString("elasticsearchPath"),
            config.getString("label"),
            displaySearchHint,
            config.getString("alias"),
            searchHintOptions
          )
        }
      )
    )
}
