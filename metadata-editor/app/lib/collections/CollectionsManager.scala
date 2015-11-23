package lib.collections

import java.net.URI

import com.gu.mediaservice.lib.argo.model.EmbeddedEntity
import model.Collection

object CollectionsManager {
  // split on only single / and convert // to /
  def stringToPath(s: String) = s.split("(?<!/)/(?!/)").map(_.replace("//", "/")).toList

  def pathToString(path: List[String]) = path.map(s => s.replace("/", "//")).mkString("/")

  def add(collection: Collection, collections: List[Collection]): List[Collection] =
    collection :: collections.filter(col => col.path != collection.path)

  def remove(path: List[String], collections: List[Collection]): List[Collection] =
    collections.filter(col => col.path != path)

  def find(path: List[String], collections: List[Collection]): Option[Collection] =
    collections.find(col => col.path == path)

  def entityUri(c: Collection) = URI.create(s"/collections/${CollectionsManager.pathToString(c.path)}")
  def entity(c: Collection) = EmbeddedEntity(entityUri(c), Some(c))
}
