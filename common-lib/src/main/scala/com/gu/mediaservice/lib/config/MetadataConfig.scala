package com.gu.mediaservice.lib.config

// TODO: Only import the semigroup syntax, but can't find out what to import
import scalaz._
import Scalaz._



import com.gu.mediaservice.model.{StaffPhotographer, ContractPhotographer, Photographer}

case class KnownPhotographer(name: String, publication: String)

object PhotographersList {
  type CreditBylineMap = Map[String, List[String]]

  import MetadataConfig.{ Store, staffPhotographers, contractedPhotographers }

  def creditBylineMap(store: Store): CreditBylineMap = store
      .groupBy{ case KnownPhotographer(_, publication) => publication }
      .map{ case (publication, photographers) => publication -> photographers.map(_.name).sortWith(_.toLowerCase < _.toLowerCase) }

  def list(store: Store) = store.map(_.name).sortWith(_.toLowerCase < _.toLowerCase)

  def caseInsensitiveLookup(store: Store, lookup: String) =
    store.reverse.find{case KnownPhotographer(name, _) => name.toLowerCase == lookup.toLowerCase}

  def getPhotographer(photographer: String): Option[Photographer] = {
    caseInsensitiveLookup(staffPhotographers, photographer).map {
      case KnownPhotographer(name, publication) => StaffPhotographer(name, publication)
    }.orElse(caseInsensitiveLookup(contractedPhotographers, photographer).map {
      case KnownPhotographer(name, publication) => ContractPhotographer(name, Some(publication))
    })
  }
}

object MetadataConfig {

  type Store = List[KnownPhotographer] // not a Map at this point to allow for duplicate keys (as some photographers take pics for multiple publications)

  implicit class KnownPhotographerOps(name: String) {
    def ->(publication: String): KnownPhotographer = KnownPhotographer(name, publication)
  }

  val externalStaffPhotographers: Store = List(
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
    "Eric Wadsworth"        -> "The Guardian",
    
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
  val internalStaffPhotographers: Store = List(
    "E Hamilton West"       -> "The Guardian",
    "Harriet St Johnston"   -> "The Guardian",
    "Lorna Roach"           -> "The Guardian",
    "Rachel Vere"           -> "The Guardian",
    "Ken Saunders"          -> "The Guardian"
  )

  val staffPhotographers: Store = externalStaffPhotographers ++ internalStaffPhotographers

  val contractedPhotographers: Store = List(
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
    "Guardian Design"
  )

  val contractIllustrators: Store = List(
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
