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
    store.map { case (name, pub) =>
      name.toLowerCase -> (name, pub)
    }.get(lookup.toLowerCase)

  def getPhotographer(photographer: String): Option[Photographer] = {
    caseInsensitiveLookup(staffPhotographers, photographer).map {
      case (name: String, pub: String) => StaffPhotographer(name, pub)
    }.orElse(caseInsensitiveLookup(contractedPhotographers, photographer).map {
      case (name: String, pub: String) => ContractPhotographer(name, Some(pub))
    })
  }
}

object MetadataConfig {

  val staffPhotographers: Map[String, String] = Map(
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
    "Catherine Shaw"        -> "The Guardian",
    "Dan Chung"             -> "The Guardian",
    "Denis Thorpe"          -> "The Guardian",
    "Don McPhee"            -> "The Guardian",
    "E Hamilton West"       -> "The Guardian",
    "Emma Baddeley"         -> "The Guardian",
    "Frank Baron"           -> "The Guardian",
    "Frank Martin"          -> "The Guardian",
    "Garry Weaser"          -> "The Guardian",
    "Graham Finlayson"      -> "The Guardian",
    "Harriet St Johnston"   -> "The Guardian",
    "James Michelson"       -> "The Guardian",
    "John Reardon"          -> "The Guardian",
    "Lorna Roach"           -> "The Guardian",
    "Marcus Mays"           -> "The Guardian",
    "Martin Argles"         -> "The Guardian",
    "Millie Burton"         -> "The Guardian",
    "Peter Johns"           -> "The Guardian",
    "Rachel Vere"           -> "The Guardian",
    "Richard Blake"         -> "The Guardian",
    "Robert Smithies"       -> "The Guardian",
    "Sean Gibson"           -> "The Guardian",
    "Ted West"              -> "The Guardian",
    "Tom Stuttard"          -> "The Guardian",
    "Tricia De Courcy Ling" -> "The Guardian",
    "Walter Doughty"        -> "The Guardian",

    "David Newell Smith"    -> "The Observer",
    "Tony McGrath"          -> "The Observer"
  )

  val contractedPhotographers: Map[String, String] = Map(
    "Antonio Zazueta"     -> "The Guardian",
    "Christian Sinibaldi" -> "The Guardian",
    "Christopher Thomond" -> "The Guardian",
    "David Levene"        -> "The Guardian",
    "Eamonn McCabe"       -> "The Guardian",
    "Felix Clay"          -> "The Guardian",
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

  val allPhotographers = staffPhotographers ++ contractedPhotographers

  val staffPhotographersMap = PhotographersList.creditBylineMap(staffPhotographers)
  val contractPhotographersMap = PhotographersList.creditBylineMap(staffPhotographers)
  val allPhotographersMap = PhotographersList.creditBylineMap(allPhotographers)

}
