package com.gu.mediaservice.lib.collections

import com.gu.mediaservice.lib.net.URI.{encode, decode}
import com.gu.mediaservice.model.Collection

object CollectionsManager {
  val delimiter = "/"

  def stringToPath(s: String) = s.split(delimiter).toList
  def pathToString(path: List[String]) = path.mkString(delimiter)
  def pathToUri(path: List[String]) = pathToString(path.map(encode))
  def uriToPath(uri: String) = stringToPath(decode(uri))

  def sortBy(c: Collection) = c.pathId

  def add(collection: Collection, collections: List[Collection]): List[Collection] =
    (collection :: collections.filter(col => col.path != collection.path)).sortBy(sortBy)

  def remove(path: List[String], collections: List[Collection]): List[Collection] =
    collections.filter(col => col.path != path)

  def find(path: List[String], collections: List[Collection]): Option[Collection] =
    collections.find(col => col.path == path)

  def findIndex(path: List[String], collections: List[Collection]): Option[Int] =
    collections.indexWhere(_.path == path) match {
      case -1    => None
      case index => Some(index)
    }

  def onlyLatest(collections: List[Collection]): List[Collection] =
    collections filter { collection =>
      // if there isn't a collection with the same path created after itself.
      !collections.exists { col => {
        col.path == collection.path && col.actionData.date.isAfter(collection.actionData.date)
      }}
    }
}
