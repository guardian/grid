package com.gu.mediaservice.lib.config

import play.api.ConfigLoader
import play.api.libs.json._

import scala.jdk.CollectionConverters._

case class FieldAlias(elasticsearchPath: String,
                      label: String,
                      displayInAdditionalMetadata: Boolean,
                      displaySearchHint: Boolean,
                      alias: String,
                      searchHintOptions: List[String],
                      // Some fields are only ever indexed when "true" (e.g. a field that is present
                      // only to support `has:`/`-has:` queries, such as fileMetadata.c2pa.isAvailable).
                      // For these fields a literal `alias:false` term query can never match, since "false"
                      // is never actually indexed - it is only ever implied by the field's absence.
                      // Setting this flag translates `alias:true`/`alias:false` search queries into
                      // exists/not-exists queries instead of literal term matches, so both values behave
                      // intuitively for users (e.g. via a searchHintOptions dropdown of "true"/"false").
                      matchViaExistence: Boolean = false)

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
          val matchViaExistence = if (config.hasPath("matchViaExistence"))
            config.getBoolean("matchViaExistence") else false

          FieldAlias(
            config.getString("elasticsearchPath"),
            config.getString("label"),
            displayInAdditionalMetadata,
            displaySearchHint,
            config.getString("alias"),
            searchHintOptions,
            matchViaExistence
          )
        }
      ).toSeq
    )
}
