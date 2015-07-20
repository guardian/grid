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

  implicit val jsonWrites: Writes[UsageRightsProperty] = Json.writes[UsageRightsProperty]

  def getPropertiesForCat(u: UsageRights): List[UsageRightsProperty] =
    agencyProperties(u) ++ photographerProperties(u) ++ restrictionProperties(u)

  private def publicationField =
    UsageRightsProperty("publication", "Publication", "string", true, Some(StaffPhotographers.creditBylineMap.keys.toList))

  private def photographerField =
    UsageRightsProperty("photographer", "Photographer", "string", true)

  private def photographerField(photographers: OptionsMap, key: String) =
    UsageRightsProperty("photographer", "Photographer", "string", true, optionsMap = Some(photographers), optionsMapKey = Some(key))

  private def restrictionProperties(u: UsageRights): List[UsageRightsProperty] = u match {
    case _:NoRights.type => List()
    case _ => List(UsageRightsProperty("restrictions", "Restrictions", "text", u.defaultCost.contains(Conditional)))
  }

  private def agencyProperties(u: UsageRights): List[UsageRightsProperty] = u match {
    case _:Agency => List(
      UsageRightsProperty("supplier", "Supplier", "string", true, Some(UsageRightsConfig.freeSuppliers)),
      UsageRightsProperty("suppliersCollection", "Collection", "string", false)
    )
    case _ => List()
  }


  private def photographerProperties(u: UsageRights): List[UsageRightsProperty] = u match {
    case _:StaffPhotographer => List(
      publicationField,
      photographerField(StaffPhotographers.creditBylineMap, "publication")
    )

    case _:CommissionedPhotographer => List(
      publicationField,
      photographerField
    )

    case _:ContractPhotographer => List(
      publicationField,
      photographerField
    )

    case _ => List()
  }
}
