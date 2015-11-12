package lib.collections

import model.Collection

object CollectionsManager {
  // split on only single / and convert // to /
  def stringToPath(s: String) = s.split("(?<!/)/(?!/)").map(_.replace("//", "/")).toList

  def pathToString(path: List[String]) = path.map(s => s.replace("/", "//")).mkString("/")

  def add(collection: Collection, collections: List[Collection]): List[Collection] =
    collection :: collections.filter(col => col.path != collection.path)

  def remove(path: List[String], collections: List[Collection]): List[Collection] =
    collections.filter(col => col.path != path)
}
