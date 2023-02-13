package lib

import lib.MetadataTemplate.CollectionFullPath
import lib.MetadataTemplateLease.LeaseDurationInMillis
import play.api.ConfigLoader
import play.api.libs.json._
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

// durationInMillis is used by Moment.js to create a duration object with the length of time in milliseconds
case class MetadataTemplateLease(leaseType: String, durationInMillis: Option[LeaseDurationInMillis] = None, notes: Option[String] = None)

object MetadataTemplateLease {
  type LeaseDurationInMillis = Long

  implicit val writes: Writes[MetadataTemplateLease] = Json.writes[MetadataTemplateLease]
}

case class MetadataTemplateUsageRights(category: String,
                                       creator: Option[String] = None,
                                       photographer: Option[String] = None,
                                       publication: Option[String] = None,
                                       restrictions: Option[String] = None,
                                       source: Option[String] = None,
                                       suppliers: Option[String] = None)

object MetadataTemplateUsageRights {
  implicit val writes: Writes[MetadataTemplateUsageRights] = Json.writes[MetadataTemplateUsageRights]
}

case class MetadataTemplate(
   templateName: String,
   metadataFields: Seq[MetadataTemplateField] = Nil,
   collectionFullPath: CollectionFullPath = Nil,
   leases: Seq[MetadataTemplateLease] = Nil,
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

        val leases = if (config.hasPath("leases")) {
          config.getConfigList("leases").asScala.map(leaseConfig => {
            MetadataTemplateLease(
              leaseType = leaseConfig.getString("leaseType"),
              durationInMillis = if (leaseConfig.hasPath("duration"))
                Some(leaseConfig.getDuration("duration").toMillis) else None,
              notes = if (leaseConfig.hasPath("notes"))
                Some(leaseConfig.getString("notes")) else None
            )
          })
        } else Nil

        val usageRights = if (config.hasPath("usageRights")) {
          val usageRightConfig = config.getConfig("usageRights")

          Some(MetadataTemplateUsageRights(
            category = usageRightConfig.getString("category"),
            creator = if (usageRightConfig.hasPath("creator"))
              Some(usageRightConfig.getString("creator")) else None,
            photographer = if (usageRightConfig.hasPath("photographer"))
              Some(usageRightConfig.getString("photographer")) else None,
            publication = if (usageRightConfig.hasPath("publication"))
              Some(usageRightConfig.getString("publication")) else None,
            restrictions = if (usageRightConfig.hasPath("restrictions"))
              Some(usageRightConfig.getString("restrictions")) else None,
            source = if (usageRightConfig.hasPath("source"))
              Some(usageRightConfig.getString("source")) else None,
            suppliers = if (usageRightConfig.hasPath("suppliers"))
              Some(usageRightConfig.getString("suppliers")) else None
          ))
        } else None

        MetadataTemplate(config.getString("templateName"), metadataFields, collectionFullPath, leases, usageRights)
      }))
}
