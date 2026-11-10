package com.gu.mediaservice.lib.config

import play.api.ConfigLoader
import play.api.libs.json.{Json, Writes}

import scala.jdk.CollectionConverters._

case class DomainMetadataField(
  name: String,
  label: String,
  fieldType: String,
  options: Option[List[String]] = None,
  // When set on a string field, editing the field across a multi-image selection offers the
  // same overwrite / add before / add after choices as the core metadata fields.
  allowEditOptions: Boolean = false
)

object DomainMetadataField {
  implicit val writes: Writes[DomainMetadataField] = Json.writes[DomainMetadataField]
}

case class DomainMetadataSpec(
  name: String,
  label: String,
  description: Option[String] = None,
  fields: Seq[DomainMetadataField] = Nil
)

object DomainMetadataSpec {
  implicit val writes: Writes[DomainMetadataSpec] = Json.writes[DomainMetadataSpec]

  implicit val configLoader: ConfigLoader[Seq[DomainMetadataSpec]] =
    ConfigLoader(_.getConfigList).map(
      _.asScala.map( config => {
        val description = if (config.hasPath("description")) Some(config.getString("description")) else None
        val fields = config.getConfigList("fields").asScala.map(config => {
          val fieldOptions = if (config.hasPath("options")) Some(config.getStringList("options").asScala.toList) else None
          val allowEditOptions = config.hasPath("allowEditOptions") && config.getBoolean("allowEditOptions")

          DomainMetadataField(
            config.getString("name"),
            config.getString("label"),
            config.getString("type"),
            fieldOptions,
            allowEditOptions
          )
        }).toSeq

        DomainMetadataSpec(
          config.getString("name"),
          config.getString("label"),
          description,
          fields
        )
      }).toSeq
    )
}
