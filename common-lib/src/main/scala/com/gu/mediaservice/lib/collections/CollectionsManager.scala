package com.gu.mediaservice.lib.collections

import com.gu.mediaservice.lib.net.URI.{encode, decode}
import com.gu.mediaservice.model.Collection


object CollectionsManager {
  val delimiter = "/"
  val doublequotes = "\""

  def stringToPath(s: String) = s.split(delimiter).toList
  def pathToString(path: List[String]) = path.mkString(delimiter)
  def pathToPathId(path: List[String]) = pathToString(path).toLowerCase
  def pathToUri(path: List[String]) = pathToString(path.map(encode))
  def uriToPath(uri: String) = stringToPath(decode(uri))

  def sortBy(c: Collection) = c.pathId

  def add(collection: Collection, collections: List[Collection]): List[Collection] =
    (collection :: collections.filter(col => col.path != collection.path)).sortBy(sortBy)

  def remove(path: List[String], collections: List[Collection]): List[Collection] =
    collections.filter(col => col.path != path)

  def find(path: List[String], collections: List[Collection]): Option[Collection] =
    collections.find(col => col.path == path)

  def findIndexes(path: List[String], collections: List[Collection]): List[Int] =
    collections.zipWithIndex.collect {
      case (collection, i) if collection.path == path => i
    }

  def onlyLatest(collections: List[Collection]): List[Collection] =
    collections filter { collection =>
      // if there isn't a collection with the same path created after itself.
      !collections.exists { col => {
        col.path == collection.path && col.actionData.date.isAfter(collection.actionData.date)
      }}
    }

  // We could use `ValidationNel`s here, but that's overkill
  def isValidPathBit(s: String) = if (s.contains(delimiter) || s.contains(doublequotes)) false else true

  val collectionColours = Map(
    "australia"    -> "#ffb93e",
    "culture"      -> "#d1008b",
    "film & music" -> "#b1532f",
    "g2"           -> "#000000",
    "guide"        -> "#8F1AB6",
    "observer"     -> "#006f94",
    "sport"        -> "#008000",
    "travel"       -> "#65C5FB"
  )

  def getCollectionColour(s: String) = collectionColours.get(s)

  def getCssColour(path: List[String]) = path.headOption.map(_.toLowerCase).flatMap(getCollectionColour)
}
