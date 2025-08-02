package com.gu.mediaservice.lib.collections

trait CollectionPaths {

  private val delimiter = "/"
  private val doublequotes = "\""

  def stringToPath(s: String): List[String] = s.split(delimiter).toList

  def pathToString(path: Seq[String]): String = path.mkString(delimiter)

  def pathToPathId(path: Seq[String]): String = pathToString(path).toLowerCase


  // We could use `ValidationNel`s here, but that's overkill
  def isValidPathBit(s: String): Boolean = if (s.contains(delimiter) || s.contains(doublequotes)) false else true

}
