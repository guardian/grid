package model

import play.api.libs.functional.syntax._
import play.api.libs.json._
import com.gu.mediaservice.lib.config.MetadataConfig.StaffPhotographers
import com.gu.mediaservice.lib.config.UsageRightsConfig
import com.gu.mediaservice.model._


// TODO: We'll be able to deprecate this and build it up directly from case
// classes.
// TODO: turn this into a case class?
case class UsageRightsProperty(
  name: String,
  label: String,
  `type`: String,
  required: Boolean,
  options: Option[List[String]] = None,
  optionsMap: Option[Map[String, List[String]]] = None,
  optionsMapKey: Option[String] = None
)


object UsageRightsProperty {
  type OptionsMap = Map[String, List[String]]
  type Options = List[String]

  implicit val jsonWrites: Writes[UsageRightsProperty] = (
    (__ \ "name").write[String] ~
    (__ \ "label").write[String] ~
    (__ \ "type").write[String] ~
    (__ \ "required").write[Boolean] ~
    (__ \ "options").writeNullable[Options] ~
    (__ \ "optionsMap").writeNullable[OptionsMap] ~
    (__ \ "optionsMapKey").writeNullable[String]
  )(u => (u.name, u.label, u.`type`, u.required, u.options, u.optionsMap, u.optionsMapKey))

  def restrictionsField(required: Boolean) =
    UsageRightsProperty("restrictions", "Restrictions", "text", required)

  def publicationField(publications: Options) =
    UsageRightsProperty("publication", "Publication", "string", true, Some(publications))

  def photographerField =
    UsageRightsProperty("photographer", "Photographer", "string", true)

  def photographerField(photographers: OptionsMap, key: String) =
    UsageRightsProperty("photographer", "Photographer", "string", true, optionsMap = Some(photographers), optionsMapKey = Some(key))

  def getPropertiesForCat(u: UsageRights): List[UsageRightsProperty] = {
    photographerProperties(u) ++ restrictionProperties(u)
  }

  private def restrictionProperties(u: UsageRights): List[UsageRightsProperty] = {
    List(restrictionsField(u.defaultCost.contains(Conditional)))
  }

  private def photographerProperties(u: UsageRights): List[UsageRightsProperty] = {
    u match {

      case _:StaffPhotographer => List(
        publicationField(StaffPhotographers.creditBylineMap.keys.toList),
        photographerField(StaffPhotographers.creditBylineMap, "publication")
      )

      case _:CommissionedPhotographer => List(
        publicationField(StaffPhotographers.creditBylineMap.keys.toList),
        photographerField
      )

      case _ => List()
    }
  }
}
