package lib

import lib.MetadataTemplate.CollectionFullPath
import play.api.ConfigLoader
import play.api.libs.json.{Json, Writes}

import scala.collection.JavaConverters._

object FieldResolveStrategy extends Enumeration {
  val replace = Value("replace")
  val append = Value("append")
  val prepend = Value("prepend")
  val ignore = Value("ignore")
}

case class MetadataTemplateField(name: String, value: String, resolveStrategy: FieldResolveStrategy.Value)

object MetadataTemplateField {
  implicit val writes: Writes[MetadataTemplateField] = Json.writes[MetadataTemplateField]
}

case class MetadataTemplateUsageRights(category: String, restrictions: Option[String] = None)

object MetadataTemplateUsageRights {
  implicit val writes: Writes[MetadataTemplateUsageRights] = Json.writes[MetadataTemplateUsageRights]
}

case class MetadataTemplate(
   templateName: String,
   metadataFields: Seq[MetadataTemplateField] = Nil,
   collectionFullPath: CollectionFullPath = Nil,
   usageRights: Option[MetadataTemplateUsageRights] = None)

object MetadataTemplate {
  type CollectionFullPath = Seq[String]

  implicit val writes: Writes[MetadataTemplate] = Json.writes[MetadataTemplate]

  implicit val configLoader: ConfigLoader[Seq[MetadataTemplate]] =
    ConfigLoader(_.getConfigList).map(
      _.asScala.map(config => {
        val metadataFields = if (config.hasPath("metadataFields")) {
          config.getConfigList("metadataFields").asScala.map(fieldConfig => {
            val resolveStrategy = if (fieldConfig.hasPath("resolveStrategy"))
              FieldResolveStrategy.withName(fieldConfig.getString("resolveStrategy")) else FieldResolveStrategy.replace

            MetadataTemplateField(
              fieldConfig.getString("name"),
              fieldConfig.getString("value"),
              resolveStrategy
            )
          })
        } else Nil

        val collectionFullPath = if (config.hasPath("collectionFullPath")) {
          config.getStringList("collectionFullPath").asScala.seq
        } else Nil

        val usageRights = if (config.hasPath("usageRights")) {
          val usageRightConfig = config.getConfig("usageRights")

          Some(MetadataTemplateUsageRights(
            category = usageRightConfig.getString("category"),
            restrictions = if (usageRightConfig.hasPath("restrictions"))
              Some(usageRightConfig.getString("restrictions")) else None
          ))
        } else None

        MetadataTemplate(config.getString("templateName"), metadataFields, collectionFullPath, usageRights)
      }))
}
