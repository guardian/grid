package model

import play.api.libs.json._
import com.gu.mediaservice.lib.config.{MetadataConfig, UsageRightsConfig}
import com.gu.mediaservice.model._

import scala.util.Random


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
  optionsMapKey: Option[String] = None,
  examples: Option[String] = None
)


object UsageRightsProperty {
  type OptionsMap = Map[String, List[String]]
  type Options = List[String]

  import MetadataConfig.{contractedPhotographers, externalPhotographersMap, contractIllustrators, creativeCommonsLicense}
  import UsageRightsConfig.freeSuppliers

  implicit val jsonWrites: Writes[UsageRightsProperty] = Json.writes[UsageRightsProperty]

  def sortList(l: List[String]) = l.sortWith(_.toLowerCase < _.toLowerCase)

  val props: List[(UsageRights) => List[UsageRightsProperty]] =
    List(categoryUsageRightsProperties, restrictionProperties)

  def getPropertiesForCat(u: UsageRights): List[UsageRightsProperty] = props.flatMap(f => f(u))

  private def requiredStringField(
    name: String,
    label: String,
    options: Option[List[String]] = None,
    examples: Option[String] = None,
    optionsMap: Option[Map[String, List[String]]] = None,
    optionsMapKey: Option[String] = None
  ) = UsageRightsProperty(name, label, "string", required = true, options,
                          optionsMap, optionsMapKey, examples)

  private def publicationField(required: Boolean)  =
    UsageRightsProperty("publication", "Publication", "string", required,
      Some(sortList(externalPhotographersMap.keys.toList)))

  private def photographerField(examples: String) =
    requiredStringField("photographer", "Photographer", examples = Some(examples))

  private def photographerField(photographers: OptionsMap, key: String) =
    requiredStringField("photographer", "Photographer",
      optionsMap = Some(photographers), optionsMapKey = Some(key))

  private def restrictionProperties(u: UsageRights): List[UsageRightsProperty] = u match {
    case _:NoRights.type => List()
    case _ => List(UsageRightsProperty("restrictions", "Restrictions", "text", u.defaultCost.contains(Conditional)))
  }

  def categoryUsageRightsProperties(u: UsageRights) = u match {
    case _:Agency => List(
      requiredStringField("supplier", "Supplier", Some(sortList(freeSuppliers))),
      UsageRightsProperty(
        "suppliersCollection", "Collection", "string", required = false,
        examples = Some("AFP, FilmMagic, WireImage"))
    )
    case _:CommissionedAgency => List(requiredStringField("supplier", "Supplier", examples = Some("Demotix")))

    case _:StaffPhotographer => List(
      publicationField(true),
      photographerField(externalPhotographersMap, "publication")
    )
    case _:ContractPhotographer =>
    List(
      publicationField(false),
      photographerField(
        Random.shuffle(contractedPhotographers)
              .take(2).map{case (photographer, _) => photographer}.mkString(", "))
    )
    case _:CommissionedPhotographer => List(
      publicationField(false),
      photographerField("Sophia Evans, Murdo Macleod")
    )

    case _:ContractIllustrator     => List(
      requiredStringField("creator", "Illustrator", Some(sortList(contractIllustrators))))

    case _:CommissionedIllustrator => List(
      requiredStringField("creator", "Illustrator", examples = Some("Ellie Foreman Peck, Matt Bors")))

    case _:CreativeCommons => List(
      requiredStringField("licence", "Licence", Some(creativeCommonsLicense)),
      requiredStringField("source", "Source", examples = Some("Wikimedia Commons")),
      requiredStringField("creator", "Owner", examples = Some("User:Colin")),
      requiredStringField("contentLink", "Link to content", examples = Some("https://commons.wikimedia.org/wiki/File:Foreign_and_Commonwealth_Office_-_Durbar_Court.jpg"))
    )

    case _:Composite => List(
      requiredStringField("suppliers", "Suppliers", examples = Some("REX/Getty Images/Corbis, Corbis/Reuters"))
    )

    case _ => List()
  }
}
