package model

import play.api.libs.functional.syntax._
import play.api.libs.json._

case class Node[T](name: String, children: List[Node[T]], data: Option[T] = None)

object Node {
  type Path = List[String]

  def buildTree[T](rootName: String, input: List[T], getPath: T => Path): Node[T] = {
    val pathsWithData = input.map(getPath).zip(input)

    def loop(input: List[(Path, T)]): List[Node[T]] = {
      input
        .filter  { case (path, data) => path.nonEmpty }
        .groupBy { case (path, data) => path.head }
        .map { case (parentName, grouped) =>
          val nextGroup = grouped.map{ case (path, data) => (path.tail, data) }
          // TODO: There is a bug here that if we don't have data (it's an assumed path)
          // we inherit the child's data.
          val dataOpt = grouped.headOption.map{case (path, data) => data }
          Node[T](parentName, loop(nextGroup), dataOpt)
        }
        .toList
    }

    Node[T](rootName, loop(pathsWithData))
  }

  implicit def nodeFormat[T: Format]: Format[Node[T]] = (
    (__ \ "name").format[String] ~
    (__ \ "children").lazyFormat(Reads.list(nodeFormat[T]), Writes.list(nodeFormat[T])) ~
    (__ \ "data").formatNullable[T]
  )(Node.apply, unlift(Node.unapply))
}
