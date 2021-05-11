package com.gu.mediaservice.lib.config

import com.gu.mediaservice.model.{ContractPhotographer, Photographer, StaffPhotographer}
import play.api.{ConfigLoader, Configuration}

import scala.collection.JavaConverters._
import scala.concurrent.Future

case class PublicationPhotographers(name: String, photographers: List[String])

object PublicationPhotographers {
  implicit val configLoader: ConfigLoader[List[PublicationPhotographers]] = ConfigLoader(_.getConfigList).map(
    _.asScala.map(
      config =>
        PublicationPhotographers(
          config.getString("name"),
          config.getStringList("photographers").asScala.toList)).toList
  )
}

trait UsageRightsConfigProvider extends Provider {
  override def initialise(): Unit = {}
  override def shutdown(): Future[Unit] = Future.successful(())

  /** By default assume that we don't do any lifecycle management */
  val externalStaffPhotographers: List[PublicationPhotographers]
  val internalStaffPhotographers: List[PublicationPhotographers]
  val contractedPhotographers: List[PublicationPhotographers]
  val contractIllustrators: List[PublicationPhotographers]
  val staffIllustrators: List[String]
  val creativeCommonsLicense: List[String]

  // this is lazy in order to ensure it is initialised after the values above are defined
  lazy val staffPhotographers: List[PublicationPhotographers] = UsageRightsConfigProvider.flattenPublicationList(
    internalStaffPhotographers ++ externalStaffPhotographers)

  // this is lazy in order to ensure it is initialised after the values above are defined
  lazy val allPhotographers: List[PublicationPhotographers] = UsageRightsConfigProvider.flattenPublicationList(
    internalStaffPhotographers ++ externalStaffPhotographers ++ contractedPhotographers)

  def getPhotographer(photographer: String): Option[Photographer] = {
    caseInsensitiveLookup(staffPhotographers, photographer).map {
      case (name, publication) => StaffPhotographer(name, publication)
    }.orElse(caseInsensitiveLookup(contractedPhotographers, photographer).map {
      case (name, publication) => ContractPhotographer(name, Some(publication))
    })
  }

  def caseInsensitiveLookup(store: List[PublicationPhotographers], lookup: String): Option[(String, String)] =
    store.map {
      case PublicationPhotographers(name, photographers) if photographers.map(_.toLowerCase) contains lookup.toLowerCase() => Some(lookup, name)
      case _ => None
    }.find(_.isDefined).flatten

  /* These are currently hardcoded */
  val payGettySourceList = List(
    "Arnold Newman Collection",
    "360cities.net Editorial",
    "360cities.net RM",
    "age fotostock RM",
    "Alinari",
    "Arnold Newman Collection",
    "ASAblanca",
    "Bob Thomas Sports Photography",
    "Carnegie Museum of Art",
    "Catwalking",
    "Contour",
    "Contour RA",
    "Corbis Premium Historical",
    "Editorial Specials",
    "Reportage Archive",
    "Gamma-Legends",
    "Genuine Japan Editorial Stills",
    "Genuine Japan Creative Stills",
    "George Steinmetz",
    "Getty Images Sport Classic",
    "Iconic Images",
    "Iconica",
    "Icon Sport",
    "Kyodo News Stills",
    "Lichfield Studios Limited",
    "Lonely Planet Images",
    "Lonely Planet RF",
    "Masters",
    "Major League Baseball Platinum",
    "Moment Select",
    "Mondadori Portfolio Premium",
    "National Geographic",
    "National Geographic RF",
    "National Geographic Creative",
    "National Geographic Magazines",
    "NBA Classic",
    "Neil Leifer Collection",
    "Newspix",
    "PA Images",
    "Papixs",
    "Paris Match Archive",
    "Paris Match Collection",
    "Pele 10",
    "Photonica",
    "Photonica World",
    "Popperfoto",
    "Popperfoto Creative",
    "Premium Archive",
    "Reportage Archive",
    "SAMURAI JAPAN",
    "Sports Illustrated",
    "Sports Illustrated Classic",
    "Sygma Premium",
    "Terry O'Neill",
    "The Asahi Shimbun Premium",
    "The LIFE Premium Collection",
    "ullstein bild Premium",
    "Ulrich Baumgarten",
    "VII Premium",
    "Vision Media",
    "Xinhua News Agency"
  )

  val freeSuppliers = List(
    "AAP",
    "Alamy",
    "Allstar Picture Library",
    "AP",
    "EPA",
    "Getty Images",
    "PA",
    "Reuters",
    "Rex Features",
    "Ronald Grant Archive",
    "Action Images",
    "Action Images/Reuters"
  )

  val suppliersCollectionExcl = Map(
    "Getty Images" -> payGettySourceList
  )
}


object UsageRightsConfigProvider {

  case class Resources()
  object ProviderLoader extends ProviderLoader[UsageRightsConfigProvider, Resources]("usage rights config")

  def flattenPublicationList(companies: List[PublicationPhotographers]): List[PublicationPhotographers] = companies
    .groupBy(_.name)
    .map { case (group, companies) => PublicationPhotographers(group, companies.flatMap(company => company.photographers)) }
    .toList
}

/** An implementation of usage rights config that can read from the configuration file */
class RuntimeUsageRightsConfig(configuration: Configuration) extends UsageRightsConfigProvider {
  val internalStaffPhotographers: List[PublicationPhotographers] = configuration.getOptional[List[PublicationPhotographers]]("internalStaffPhotographers").getOrElse(Nil)
  val externalStaffPhotographers: List[PublicationPhotographers] = configuration.getOptional[List[PublicationPhotographers]]("externalStaffPhotographers").getOrElse(Nil)
  val contractedPhotographers: List[PublicationPhotographers] = configuration.getOptional[List[PublicationPhotographers]]("contractedPhotographers").getOrElse(Nil)
  val contractIllustrators: List[PublicationPhotographers] = configuration.getOptional[List[PublicationPhotographers]]("contractIllustrators").getOrElse(Nil)
  val staffIllustrators: List[String] = configuration.getOptional[Seq[String]]("staffIllustrators").map(_.toList).getOrElse(Nil)
  val creativeCommonsLicense: List[String] = configuration.getOptional[Seq[String]]("creativeCommonsLicense").map(_.toList).getOrElse(Nil)
}
