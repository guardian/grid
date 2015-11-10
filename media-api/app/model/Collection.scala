package model

import play.api.libs.json._

case class Collection(name: String, subCollections: List[Collection])
object Collection {
  def buildTree(rootName: String, input: List[List[String]]): Collection = {
    def loop(input: List[List[String]]): List[Collection] = {
      input
        .filter(_.nonEmpty).groupBy(_.head)
        .map { case (parentCollectionName, subCollections) =>
          Collection(parentCollectionName, loop(subCollections.map(_.tail)))
        }
        .toList
    }
    Collection(rootName, loop(input))
  }

  implicit def nodeFormat: Format[Collection] = Json.format[Collection]
}
