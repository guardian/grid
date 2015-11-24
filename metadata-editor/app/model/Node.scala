package model

import play.api.libs.functional.syntax._
import play.api.libs.json._

case class Node[T](name: String, children: List[Node[T]], content: Option[T] = None)

object Node {
  type Path = List[String]

  def buildTree[T](rootName: String, input: List[T], getPath: T => Path): Node[T] = {
    val pathsWithContent = input.map(getPath).zip(input)

    def loop(input: List[(Path, T)]): List[Node[T]] = {
      input
        .filter  { case (path, content) => path.nonEmpty }
        .groupBy { case (path, content) => path.head }
        .map { case (parentName, grouped) =>
          val nextGroup = grouped.map{ case (path, content) => (path.tail, content) }
          // TODO: There is a bug here that if we don't have content (it's an assumed path)
          // we inherit the child's content.
          val contentOpt = grouped.headOption.map{case (path, content) => content }
          Node[T](parentName, loop(nextGroup), contentOpt)
        }
        .toList
    }

    Node[T](rootName, loop(pathsWithContent))
  }

  implicit def nodeFormat[T: Format]: Format[Node[T]] = (
    (__ \ "name").format[String] ~
    (__ \ "children").lazyFormat(Reads.list(nodeFormat[T]), Writes.list(nodeFormat[T])) ~
    (__ \ "content").formatNullable[T]
  )(Node.apply, unlift(Node.unapply))
}
