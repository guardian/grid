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
    "Christopher Thomond" -> "The Guardian",
    "Sean Smith"          -> "The Guardian",
    "David Levene"        -> "The Guardian",
    "David Sillitoe"      -> "The Guardian",
    "Eamonn Mccabe"       -> "The Guardian",
    "Felicity Cloake"     -> "The Guardian",
    "Frank Baron"         -> "The Guardian",
    "Graeme Robertson"    -> "The Guardian",
    "Graham Turner"       -> "The Guardian",
    "Martin Argles"       -> "The Guardian",
    "Martin Godwin"       -> "The Guardian",
    "Mike Bowers"         -> "The Guardian",
    "Murdo Macleod"       -> "The Guardian",
    "Sarah Lee"           -> "The Guardian",
    "Tom Jenkins"         -> "The Guardian",
    "Tristram Kenton"     -> "The Guardian",
    "Andy Hall"           -> "The Observer",
    "Antonio Olmos"       -> "The Observer",
    "Catherine Shaw"      -> "The Observer",
    "Gary Calton"         -> "The Observer",
    "Karen Robinson"      -> "The Observer",
    "Katherine Anne Rose" -> "The Observer",
    "Richard Saker"       -> "The Observer",
    "Sophia Evans"        -> "The Observer",
    "Suki Dhanda"         -> "The Observer"
  )

  val contractedPhotographers: Map[String, String] = Map(
    "Linda Nylind" -> "The Guardian"
  )

  val allPhotographers = staffPhotographers ++ contractedPhotographers

  val staffPhotographersMap = PhotographersList.creditBylineMap(staffPhotographers)
  val contractPhotgraphersMap = PhotographersList.creditBylineMap(staffPhotographers)
  val allPhotographersMap = PhotographersList.creditBylineMap(allPhotographers)

}
