package model

import play.api.libs.json._
import com.gu.mediaservice.lib.config.{MetadataConfig, UsageRightsConfig}
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

  import MetadataConfig.{staffPhotographersMap, contractIllustrators}
  import UsageRightsConfig.freeSuppliers

  implicit val jsonWrites: Writes[UsageRightsProperty] = Json.writes[UsageRightsProperty]

  def sortList(l: List[String]) = l.sortWith(_.toLowerCase < _.toLowerCase)

  val props: List[(UsageRights) => List[UsageRightsProperty]] =
    List(agencyProperties, photographerProperties, restrictionProperties, illustrationProperties)

  def getPropertiesForCat(u: UsageRights): List[UsageRightsProperty] = props.flatMap(f => f(u))

  private def publicationField(required: Boolean)  =
    UsageRightsProperty("publication", "Publication", "string", required,
      Some(sortList(staffPhotographersMap.keys.toList)))

  private def photographerField =
    UsageRightsProperty("photographer", "Photographer", "string", true)

  private def photographerField(photographers: OptionsMap, key: String) =
    UsageRightsProperty("photographer", "Photographer", "string", true, optionsMap = Some(photographers), optionsMapKey = Some(key))

  private def restrictionProperties(u: UsageRights): List[UsageRightsProperty] = u match {
    case _:NoRights.type => List()
    case _ => List(UsageRightsProperty("restrictions", "Restrictions", "text", u.defaultCost.contains(Conditional)))
  }

  private def agencyProperties(u: UsageRights) = u match {
    case _:Agency => List(
      UsageRightsProperty("supplier", "Supplier", "string", true, Some(sortList(freeSuppliers))),
      UsageRightsProperty("suppliersCollection", "Collection", "string", false)
    )

    case _:CommissionedAgency => List(UsageRightsProperty("supplier", "Supplier", "string", true))
    case _ => List()
  }


  private def photographerProperties(u: UsageRights) = u match {
    case _:StaffPhotographer => List(
      publicationField(true),
      photographerField(staffPhotographersMap, "publication")
    )

    case _:CommissionedPhotographer => List(
      publicationField(false),
      photographerField
    )

    case _:ContractPhotographer => List(
      publicationField(false),
      photographerField
    )

    case _ => List()
  }

  private def illustrationProperties(u: UsageRights) = u match {
    case _:ContractIllustrator     => List(
      UsageRightsProperty("creator", "Illustrator", "string", true, Some(sortList(contractIllustrators))))
    case _:CommissionedIllustrator => List(
      UsageRightsProperty("creator", "Illustrator", "string", true))
    case _ => List()
  }
}
