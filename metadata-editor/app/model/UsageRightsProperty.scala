package model

import com.gu.mediaservice.lib.config.{PublicationPhotographers, IndependentType, UsageRightsConfigProvider}
import com.gu.mediaservice.model._
import play.api.libs.json._


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
  examples: Option[String] = None,
  // @TODO: This is a bit gross :(
  // For properties whose options depend on more than one other field (e.g. GnmOwned's "creator"
  // depends on both "usageRightsImageType" and "publication"), optionsMap is instead keyed by the
  // joined values of these fields, in order, separated by "|".
  optionsMapKeys: Option[List[String]] = None,
)


object UsageRightsProperty {
  type OptionsMap = Map[String, List[String]]
  type Options = List[String]

  implicit val jsonWrites: Writes[UsageRightsProperty] = Json.writes[UsageRightsProperty]

  def sortList(l: List[String]) = l.sortWith(_.toLowerCase < _.toLowerCase)

  def sortPublicationList(publications: List[PublicationPhotographers]): List[PublicationPhotographers] =
    publications.map(p =>
      p.copy(photographers = p.photographers.sortWith(_.name.toLowerCase < _.name.toLowerCase))
    )

  val props: List[(UsageRightsSpec, UsageRightsConfigProvider) => List[UsageRightsProperty]] =
    List(categoryUsageRightsProperties, restrictionProperties)

  def publicationListToMap(publications: List[PublicationPhotographers]): OptionsMap = Map(publications
    .map(p => p.name -> p.photographers.map(_.name)): _*)

  def independentTypeListToMap(independentTypes: List[IndependentType]): OptionsMap = Map(independentTypes
    .map(s => s.name -> s.productionsCompanies): _*)

  def optionsFromPublicationList(publications: List[PublicationPhotographers]): Options = sortList(publicationListToMap(publications).keys.toList)

  def getPropertiesForSpec(u: UsageRightsSpec, p: UsageRightsConfigProvider): List[UsageRightsProperty] = props.flatMap(f => f(u, p))

  private def requiredStringField(
    name: String,
    label: String,
    options: Option[List[String]] = None,
    examples: Option[String] = None,
    optionsMap: Option[Map[String, List[String]]] = None,
    optionsMapKey: Option[String] = None
  ) = UsageRightsProperty(name, label, "string", required = true, options,
                          optionsMap, optionsMapKey, examples)

  private def publicationField(required: Boolean, options: Options)  =
    UsageRightsProperty("publication", "Publication", "string", required,
      Some(sortList(options)))

  private def photographerField(examples: String) =
    requiredStringField("photographer", "Photographer", examples = Some(examples))

  private def photographerField(photographers: List[PublicationPhotographers], key: String) =
    requiredStringField("photographer", "Photographer",
      optionsMap = Some(publicationListToMap(photographers)), optionsMapKey = Some(key))

  private def illustratorField(illustrators: List[PublicationPhotographers], key: String) =
    requiredStringField("creator", "Illustrator",
      optionsMap = Some(publicationListToMap(illustrators)), optionsMapKey = Some(key))

  private def restrictionProperties(u: UsageRightsSpec, p: UsageRightsConfigProvider): List[UsageRightsProperty] = u match {
    case NoRights => List()
    case _ => List(UsageRightsProperty("restrictions", "Restrictions", "text", u.defaultCost.contains(Conditional)))
  }

  def categoryUsageRightsProperties(u: UsageRightsSpec, p: UsageRightsConfigProvider) = u match {
    case Agency => List(
      requiredStringField("supplier", "Supplier", Some(sortList(p.freeSuppliers))),
      UsageRightsProperty(
        "suppliersCollection", "Collection", "string", required = false,
        examples = Some("News"))
    )

    case CommissionedAgency => List(requiredStringField("supplier", "Supplier", examples = Some("Corbis")))

    case StaffPhotographer => List(
      publicationField(required = true, optionsFromPublicationList(p.staffPhotographers)),
      photographerField(sortPublicationList(p.staffPhotographers), "publication")
    )

    case ContractPhotographer => List(
      publicationField(required = true, optionsFromPublicationList(p.contractedPhotographers)),
      photographerField(sortPublicationList(p.contractedPhotographers), "publication")
    )

    case CommissionedPhotographer => List(
      publicationField(required = false, optionsFromPublicationList(p.staffPhotographers)),
      photographerField("Sophia Evans, Murdo MacLeod")
    )

    case ContractIllustrator => List(
      publicationField(required = true, optionsFromPublicationList(p.contractIllustrators)),
      illustratorField(sortPublicationList(p.contractIllustrators), "publication")
    )

    case StaffIllustrator =>
      val options = if (p.staffIllustrators.isEmpty) None else Some(sortList(p.staffIllustrators))
      List(
      requiredStringField("creator", "Illustrator", options))

    case CommissionedIllustrator => List(
      publicationField(required = false, optionsFromPublicationList(p.staffPhotographers)),
      requiredStringField("creator", "Illustrator", examples = Some("Ellie Foreman Peck, Matt Bors")))

    case CreativeCommons => List(
      requiredStringField("licence", "Licence", Some(p.creativeCommonsLicense)),
      requiredStringField("source", "Source", examples = Some("Wikimedia Commons")),
      requiredStringField("creator", "Owner", examples = Some("User:Colin")),
      requiredStringField("contentLink", "Link to content", examples = Some("https://commons.wikimedia.org/wiki/File:Foreign_and_Commonwealth_Office_-_Durbar_Court.jpg"))
    )

    case Composite => List(
      requiredStringField("suppliers", "Suppliers", examples = Some("REX/Getty Images/Corbis, Corbis/Reuters"))
    )

    case Screengrab => List(
      requiredStringField("source", "Source", examples = Some("BBC News, HBO, ITV"))
    )

    case ProgrammesIndependents =>
      val independentTypeMap = p.programmesIndependentsConfig match {
        case Some(config) => independentTypeListToMap(config.independentTypes)
        case None => Map.empty[String, List[String]]
      }
      List(
        UsageRightsProperty("independentType", "Independent Type", "string", required = true, Some(sortList(independentTypeMap.keys.toList))),
        requiredStringField("productionCompany", "Production Company", optionsMap = Some(independentTypeMap), optionsMapKey = Some("independentType"))
      )

    case ProgrammesAcquisitions => List(
      requiredStringField("productionCompany", "Production Company", examples = Some("Example production"))
    )

    case PrAndThirdParty => List(
      requiredStringField("source", "Source", examples = Some("Getty Images, Corbis, Reuters")),
    )

    case GnmOwned =>
      val photographersByPublication: OptionsMap = p.allPhotographers.map(pub => pub.name -> sortList(pub.photographers.map(_.name))).toMap
      // @TODO: staffIllustrators need to have a publication set - until then they're offered
      // regardless of the chosen publication, alongside contractIllustrators.photographers
      val illustratorsByPublication: OptionsMap = p.contractIllustrators.map(pub => pub.name -> sortList(pub.photographers.map(_.name))).toMap

      val publicationsWithPhotographers = sortList(photographersByPublication.keys.toList)
      val publicationsWithIllustrators = sortList(illustratorsByPublication.keys.toList)
      val allPublications = sortList((publicationsWithPhotographers ++ publicationsWithIllustrators).distinct)

      // Keyed by the selected "usageRightsImageType", reusing the existing optionsMap/optionsMapKey
      // dependent-dropdown mechanism (normally keyed by "publication") so the publication options
      // update based on whether Photograph, Illustration or Composite is selected.
      val publicationsByImageType: OptionsMap = Map(
        "Photograph" -> publicationsWithPhotographers,
        "Illustration" -> publicationsWithIllustrators,
        "Composite" -> allPublications
      )

      def creatorsFor(imageType: String, publication: String): List[String] = imageType match {
        case "Photograph" => photographersByPublication.getOrElse(publication, Nil)
        case "Illustration" => sortList((illustratorsByPublication.getOrElse(publication, Nil) ++ p.staffIllustrators).distinct)
        case "Composite" => sortList((photographersByPublication.getOrElse(publication, Nil) ++ illustratorsByPublication.getOrElse(publication, Nil) ++ p.staffIllustrators).distinct)
        case _ => Nil
      }

      // Keyed by "<usageRightsImageType>|<publication>", so the creator options are filtered by both
      // the selected image type and the selected publication.
      val creatorsByImageTypeAndPublication: OptionsMap = (for {
        imageType <- List("Photograph", "Illustration", "Composite")
        publication <- allPublications
      } yield s"$imageType|$publication" -> creatorsFor(imageType, publication)).toMap

      List(
        UsageRightsProperty(
          "usageRightsImageType", "Image Type", "string", required = true,
          // @TODO: Can we tighten this list somewhere so it's consistent with metadata image type
          // @TODO: Add 'Computer Generated'?
          options = Some(List("Photograph", "Illustration", "Composite")),
        ),
        UsageRightsProperty(
          "publication", "Publication", "string", required = true,
          optionsMap = Some(publicationsByImageType), optionsMapKey = Some("usageRightsImageType")
        ),
        UsageRightsProperty(
          "creator", "Creator", "string", required = true,
          optionsMap = Some(creatorsByImageTypeAndPublication),
          optionsMapKeys = Some(List("usageRightsImageType", "publication"))
        )
      )

    case _ => List()
  }
}
