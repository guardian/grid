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
    "Ben Doherty"     -> "The Guardian",
    "Bill Code"       -> "The Guardian",
    "Calla Wahlquist" -> "The Guardian",
    "David Sillitoe"  -> "The Guardian",
    "Graham Turner"   -> "The Guardian",
    "Helen Davidson"  -> "The Guardian",
    "Jill Mead"       -> "The Guardian",
    //"Jonny Weeks"     -> "The Guardian", (Commented out as Jonny's photo's aren't always as Staff.)
    "Joshua Robertson" -> "The Guardian",
    "Rachel Vere"     -> "The Guardian",
    "Roger Tooth"     -> "The Guardian",
    "Sean Smith"      -> "The Guardian",
    "Melissa Davey"   -> "The Guardian",
    "Michael Safi"    -> "The Guardian",
    "Michael Slezak"  -> "The Guardian",
    "Sean Smith"      -> "The Guardian",
    "Carly Earl"      -> "The Guardian",

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
    "Harriet St Johnston"   -> "The Guardian",
    "Lorna Roach"           -> "The Guardian",
    "Rachel Vere"           -> "The Guardian",
    "Ken Saunders"          -> "The Guardian"
  )

  val staffPhotographers = externalStaffPhotographers ++ internalStaffPhotographers

  val contractedPhotographers: Map[String, String] = Map(
    "Alicia Canter"       -> "The Guardian",
    "Antonio Olmos"       -> "The Guardian",
    "Christopher Thomond" -> "The Guardian",
    "David Levene"        -> "The Guardian",
    "Eamonn McCabe"       -> "The Guardian",
    "Graeme Robertson"    -> "The Guardian",
    "Johanna Parkin"      -> "The Guardian",
    "Linda Nylind"        -> "The Guardian",
    "Louise Hagger"       -> "The Guardian",
    "Martin Godwin"       -> "The Guardian",
    "Mike Bowers"         -> "The Guardian",
    "Murdo MacLeod"       -> "The Guardian",
    "Sarah Lee"           -> "The Guardian",
    "Tom Jenkins"         -> "The Guardian",
    "Tristram Kenton"     -> "The Guardian",
    "Jill Mead"           -> "The Guardian",

    "Andy Hall"           -> "The Observer",
    "Antonio Olmos"       -> "The Observer",
    "Gary Calton"         -> "The Observer",
    "Jane Bown"           -> "The Observer",
    "Jonathan Lovekin"    -> "The Observer",
    "Karen Robinson"      -> "The Observer",
    "Katherine Anne Rose" -> "The Observer",
    "Richard Saker"       -> "The Observer",
    "Sophia Evans"        -> "The Observer",
    "Suki Dhanda"         -> "The Observer"
  )

  val staffIllustrators = List(
    "Mona Chalabi",
    "Sam Morris",
    "Guardian Design"
  )

  val contractIllustrators: Map[String, String] = Map(
    "Ben Lamb"              -> "The Guardian",
    "Andrzej Krauze"        -> "The Guardian",
    "David Squires"         -> "The Guardian",
    "First Dog on the Moon" -> "The Guardian",
    "Harry Venning"         -> "The Guardian",
    "Martin Rowson"         -> "The Guardian",
    "Matt Kenyon"           -> "The Guardian",
    "Matthew Blease"        -> "The Guardian",
    "Nicola Jennings"       -> "The Guardian",
    "Rosalind Asquith"      -> "The Guardian",
    "Steve Bell"            -> "The Guardian",
    "Steven Appleby"        -> "The Guardian",
    "Ben Jennings"          -> "The Guardian",
    "Chris Riddell"         -> "The Observer",
    "David Foldvari"        -> "The Observer",
    "David Simonds"         -> "The Observer",
  )

  val allPhotographers = staffPhotographers ++ contractedPhotographers

  val externalPhotographersMap = PhotographersList.creditBylineMap(externalStaffPhotographers)
  val staffPhotographersMap = PhotographersList.creditBylineMap(staffPhotographers)
  val contractPhotographersMap = PhotographersList.creditBylineMap(contractedPhotographers)
  val allPhotographersMap = PhotographersList.creditBylineMap(allPhotographers)
  val contractIllustratorsMap = PhotographersList.creditBylineMap(contractIllustrators)

  val creativeCommonsLicense = List(
    "CC BY-4.0", "CC BY-SA-4.0", "CC BY-ND-4.0"
  )

}
