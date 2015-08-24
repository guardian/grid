package com.gu.mediaservice.lib.config

// TODO: Only import the semigroup syntax, but can't find out what to import
import scalaz._
import Scalaz._

object PhotographersList {
  type Store = Map[String, String]
  type CreditBylineMap = Map[String, List[String]]

  def creditBylineMap(store: Store): CreditBylineMap = store
      .groupBy{ case (photographer, publication) => publication }
      .map{ case (publication, photographers) => publication -> photographers.keys.toList.sortWith(_.toLowerCase < _.toLowerCase) }

  def creditBylineMap(stores: List[Store]): CreditBylineMap =
    stores.map(creditBylineMap).reduceLeft(_ |+| _)

  def list(store: Store) = store.keys.toList.sortWith(_.toLowerCase < _.toLowerCase)

  def getPublication(store: Store, name: String): Option[String] = store.get(name)
}

object MetadataConfig {
  val staffPhotographers = Map(
    // Current
    "David Sillitoe" -> "The Guardian",
    "Graham Turner"  -> "The Guardian",
    "Sean Smith"     -> "The Guardian",
    "Jill Mead"      -> "The Guardian",
    "Roger Tooth"    -> "The Guardian",
    "James Mann"     -> "The Guardian",
    "Rachel Vere"    -> "The Guardian",
    "Alicia Canter"  -> "The Guardian",
    "Bill Code"      -> "The Guardian",

    // Past
    "Dan Chung"             -> "The Guardian",
    "Denis Thorpe"          -> "The Guardian",
    "Don McPhee"            -> "The Guardian",
    "E Hamilton West"       -> "The Guardian",
    "Martin Argles"         -> "The Guardian",
    "Peter Johns"           -> "The Guardian",
    "Robert Smithies"       -> "The Guardian",
    "Frank Baron"           -> "The Guardian",
    "Frank Martin"          -> "The Guardian",
    "Garry Weaser"          -> "The Guardian",
    "Walter Doughty"        -> "The Guardian",
    "Tom Stuttard"          -> "The Guardian",
    "Graham Finlayson"      -> "The Guardian",
    "Ted West"              -> "The Guardian",
    "John Reardon"          -> "The Guardian",
    "Tricia De Courcy Ling" -> "The Guardian",
    "Marcus Mays"           -> "The Guardian",
    "Richard Blake"         -> "The Guardian",
    "Millie Burton"         -> "The Guardian",
    "Emma Baddeley"         -> "The Guardian",
    "Sean Gibson"           -> "The Guardian",
    "Harriet St Johnston"   -> "The Guardian",
    "Catherine Shaw"        -> "The Guardian",
    "James Michelson"       -> "The Guardian",
    "Lorna Roach"           -> "The Guardian",
    "Catherine Shaw"        -> "The Guardian",
    "Rachel Vere"           -> "The Guardian",

    "David Newell Smith"    -> "The Observer",
    "Tony McGrath"          -> "The Observer"
  )

  val contractedPhotographers: Map[String, String] = Map(
    "Antonio Zazueta"     -> "The Guardian",
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
    "Christian Sinibaldi" -> "The Guardian",

    "Andy Hall"           -> "The Observer",
    "Gary Calton"         -> "The Observer",
    "Sophia Evans"        -> "The Observer",
    "Antonio Olmos"       -> "The Observer",
    "Karen Robinson"      -> "The Observer",
    "Katherine Anne Rose" -> "The Observer",
    "Richard Saker"       -> "The Observer",
    "Suki Dhanda"         -> "The Observer"
  )

  val allPhotographers = staffPhotographers ++ contractedPhotographers

  val staffPhotographersMap = PhotographersList.creditBylineMap(staffPhotographers)
  val contractPhotographersMap = PhotographersList.creditBylineMap(staffPhotographers)
  val allPhotographersMap = PhotographersList.creditBylineMap(allPhotographers)

}
