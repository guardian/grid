package model

import play.api.libs.functional.syntax._
import play.api.libs.json._

case class Node[T](name: String, children: List[Node[T]], path: Node.Path, content: Option[T] = None)

object Node {
  // TODO: generify with List[V].
  // It's hard to do as the JSON parsers stop working
  type Path = List[String]

  def buildTree[T](rootName: String, input: List[T], getPath: T => Path): Node[T] = {
    val zipped = (input.map(getPath), input).zipped.toList

    def loop(input: List[(Path, T)]): List[Node[T]] = {
      input
        // TODO: We could NonEmptyLists here
        .filter  { case (path, _) => path.nonEmpty }
        .groupBy { case (path, _) => path.head }
        .map { case (parentName, grouped) =>
          val nextGroup = grouped.map { case (path, content) => (path.tail, content) }
          // TODO: Fix this hack
          val nextPath = grouped.headOption.map { case (path, _) => path } getOrElse Nil
          val contentOpt = grouped.headOption flatMap { case (path, content) =>
            // only attach the content if we actually have it, and it's not inherited
            // from the child nodes
            if (path.size == 1) Some(content) else None
          }
          Node[T](parentName, loop(nextGroup), nextPath, contentOpt)
        }
        .toList
        // TODO: move this out to a generic Node.sort def
        .sortBy(_.path.mkString("/")).sortBy(_.children.isEmpty)

    }

    Node[T](rootName, loop(zipped), List(rootName))
  }

  implicit def nodeFormat[T: Format]: Format[Node[T]] = (
    (__ \ "name").format[String] ~
    (__ \ "children").lazyFormat(Reads.list(nodeFormat[T]), Writes.list(nodeFormat[T])) ~
    (__ \ "path").format[List[String]] ~
    (__ \ "content").formatNullable[T]
  )(Node.apply, unlift(Node.unapply))
}
