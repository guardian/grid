package com.gu.mediaservice.lib.config

import play.api.ConfigLoader
import play.api.libs.json.{Json, Writes}

import scala.collection.JavaConverters._

case class DomainMetadataField(
  name: String,
  label: String,
  fieldType: String,
  options: Option[List[String]] = None
)

object DomainMetadataField {
  implicit val writes: Writes[DomainMetadataField] = Json.writes[DomainMetadataField]
}

case class DomainMetadataSpec(
  `type`: String,
  name: String,
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

          DomainMetadataField(
            config.getString("name"),
            config.getString("label"),
            config.getString("type"),
            fieldOptions
          )
        })

        DomainMetadataSpec(
          config.getString("type"),
          config.getString("name"),
          description,
          fields
        )
      })
    )
}
