package com.gu.mediaservice.lib.collections

trait CssColours {

  private val delimiter = "/"

  // These use Source swatches
  private val collectionColours = Map(
    "australia" -> "#185E36",
    "culture" -> "#BB3B80",
    "film & music" -> "#6B5840",
    "g2" -> "#121212",
    "guide" -> "#7D0068",
    "observer" -> "#052962",
    "sport" -> "#22874D",
    "travel" -> "#041F4A"
  )

  def getCssColour(path: List[String]): Option[String] = {
    def forPath(depth: Int, default: Option[String]): Option[String] = {
      if (depth > path.size) {
        default
      } else {
        val pathId = path.take(depth).map(_.toLowerCase()).mkString(delimiter)
        collectionColours.get(pathId).map { colour =>
          forPath(depth + 1, Some(colour))
        }.getOrElse {
          default
        }
      }
    }
    // recurse drop the path return the furthest leaf node
    forPath(depth = 1, default = None)
  }

}
