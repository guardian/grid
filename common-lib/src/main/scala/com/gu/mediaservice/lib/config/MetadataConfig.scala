package com.gu.mediaservice.lib.config

// TODO: Only import the semigroup syntax, but can't find out what to import
import scalaz._
import Scalaz._



import com.gu.mediaservice.model.{StaffPhotographer, ContractPhotographer, Photographer}

object PhotographersList {
  type Store = Map[String, String]
  type CreditBylineMap = Map[String, List[String]]

  import MetadataConfig.{ staffPhotographers, contractedPhotographers }

  def creditBylineMap(store: Store): CreditBylineMap = store
      .groupBy{ case (photographer, publication) => publication }
      .map{ case (publication, photographers) => publication -> photographers.keys.toList.sortWith(_.toLowerCase < _.toLowerCase) }

  def creditBylineMap(stores: List[Store]): CreditBylineMap =
    stores.map(creditBylineMap).reduceLeft(_ |+| _)

  def list(store: Store) = store.keys.toList.sortWith(_.toLowerCase < _.toLowerCase)

  def getPublication(store: Store, name: String): Option[String] = store.get(name)

  def caseInsensitiveLookup(store: Store, lookup: String) =
    store.find{case (name, pub) => name.toLowerCase == lookup.toLowerCase}

  def getPhotographer(photographer: String): Option[Photographer] = {
    caseInsensitiveLookup(staffPhotographers, photographer).map {
      case (name, pub) => StaffPhotographer(name, pub)
    }.orElse(caseInsensitiveLookup(contractedPhotographers, photographer).map {
      case (name, pub) => ContractPhotographer(name, Some(pub))
    })
  }
}

object MetadataConfig {

  val externalStaffPhotographers: Map[String, String] = Map(
    // Current
    "Alicia Canter"  -> "The Guardian",
    "Bill Code"      -> "The Guardian",
    "David Sillitoe" -> "The Guardian",
    "Graham Turner"  -> "The Guardian",
    "James Mann"     -> "The Guardian",
    "Jill Mead"      -> "The Guardian",
    "Rachel Vere"    -> "The Guardian",
    "Roger Tooth"    -> "The Guardian",
    "Sean Smith"     -> "The Guardian",

    // Past
    "Dan Chung"             -> "The Guardian",
    "Denis Thorpe"          -> "The Guardian",
    "Don McPhee"            -> "The Guardian",
    "Frank Baron"           -> "The Guardian",
    "Frank Martin"          -> "The Guardian",
    "Garry Weaser"          -> "The Guardian",
    "Graham Finlayson"      -> "The Guardian",
    "Martin Argles"         -> "The Guardian",
    "Peter Johns"           -> "The Guardian",
    "Robert Smithies"       -> "The Guardian",
    "Tom Stuttard"          -> "The Guardian",
    "Tricia De Courcy Ling" -> "The Guardian",
    "Walter Doughty"        -> "The Guardian",
    "David Newell Smith"    -> "The Observer",
    "Tony McGrath"          -> "The Observer",
    "Catherine Shaw"        -> "The Observer",
    "John Reardon"          -> "The Observer",
    "Sean Gibson"           -> "The Observer"
  )

  // these are people who aren't photographers by trade, but have taken photographs for us.
  // This is mainly used so when we ingest photos from Picdar, we make sure we categorise
  // them correctly.
  // TODO: Think about removin these once Picdar is dead.
  val internalStaffPhotographers = List(
    "E Hamilton West"       -> "The Guardian",
    "Emma Baddeley"         -> "The Guardian",
    "Harriet St Johnston"   -> "The Guardian",
    "James Michelson"       -> "The Guardian",
    "Lorna Roach"           -> "The Guardian",
    "Marcus Mays"           -> "The Guardian",
    "Millie Burton"         -> "The Guardian",
    "Rachel Vere"           -> "The Guardian",
    "Richard Blake"         -> "The Guardian"
  )

  val staffPhotographers = externalStaffPhotographers ++ internalStaffPhotographers

  val contractedPhotographers: Map[String, String] = Map(
    "Antonio Zazueta"     -> "The Guardian",
    "Christian Sinibaldi" -> "The Guardian",
    "Christopher Thomond" -> "The Guardian",
    "David Levene"        -> "The Guardian",
    "Eamonn McCabe"       -> "The Guardian",
    "Graeme Robertson"    -> "The Guardian",
    "Jane Bown"           -> "The Guardian",
    "Johanna Parkin"      -> "The Guardian",
    "Jonathan Lovekin"    -> "The Guardian",
    "Katherine Rose"      -> "The Guardian",
    "Linda Nylind"        -> "The Guardian",
    "Louise Hagger"       -> "The Guardian",
    "Martin Godwin"       -> "The Guardian",
    "Mike Bowers"         -> "The Guardian",
    "Murdo Macleod"       -> "The Guardian",
    "Sarah Lee"           -> "The Guardian",
    "Tom Jenkins"         -> "The Guardian",
    "Tristram Kenton"     -> "The Guardian",

    "Andy Hall"           -> "The Observer",
    "Antonio Olmos"       -> "The Observer",
    "Gary Calton"         -> "The Observer",
    "Karen Robinson"      -> "The Observer",
    "Katherine Anne Rose" -> "The Observer",
    "Richard Saker"       -> "The Observer",
    "Sophia Evans"        -> "The Observer",
    "Suki Dhanda"         -> "The Observer"
  )

  val contractIllustrators = List(
    "Ben Lamb",
    "Andrzej Krauze",
    "C&J Riddell Ltd",
    "Chris Ware",
    "David Foldvari",
    "David Simonds",
    "David Squires",
    "First Dog on the Moon Institute",
    "Harry Venning",
    "Ian Tovey",
    "Kipper Williams",
    "Martin Rowson",
    "Matt Kenyon",
    "Matthew Blease",
    "Nicola Jennings",
    "Rosalind Asquith",
    "Steve Bell",
    "Steven Appleby"
  )

  val allPhotographers = staffPhotographers ++ contractedPhotographers

  val externalPhotographersMap = PhotographersList.creditBylineMap(externalStaffPhotographers)
  val staffPhotographersMap = PhotographersList.creditBylineMap(staffPhotographers)
  val contractPhotographersMap = PhotographersList.creditBylineMap(staffPhotographers)
  val allPhotographersMap = PhotographersList.creditBylineMap(allPhotographers)

  val creativeCommonsLicense = List(
    "CC BY-4.0", "CC BY-SA-4.0", "CC BY-ND-4.0"
  )

}
