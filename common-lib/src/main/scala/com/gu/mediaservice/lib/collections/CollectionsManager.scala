package com.gu.mediaservice.lib.collections

import java.net.URLDecoder.decode
import java.net.URLEncoder.encode

import com.gu.mediaservice.model.Collection

object CollectionsManager {
  val delimiter = "/"
  val enc = "UTF-8"
  def decodePathBit(s: String) = decode(s, enc)
  def encodePathBit(s: String) = encode(s, enc)

  def stringToPath(s: String) = s.split(delimiter).map(decodePathBit).toList
  def pathToString(path: List[String]) = path.map(encodePathBit).mkString(delimiter)

  def sortBy(c: Collection) = c.pathId

  def add(collection: Collection, collections: List[Collection]): List[Collection] =
    (collection :: collections.filter(col => col.path != collection.path)).sortBy(sortBy)

  def remove(path: List[String], collections: List[Collection]): List[Collection] =
    collections.filter(col => col.path != path)

  def find(path: List[String], collections: List[Collection]): Option[Collection] =
    collections.find(col => col.path == path)
}
