package model

import play.api.libs.functional.syntax._
import play.api.libs.json._

case class Node[T](name: String, children: List[Node[T]], pathId: String, content: Option[T] = None)

object Node {
  // TODO: generify with List[V].
  // It's hard to do as the JSON parsers stop working
  type Path = List[String]

  def buildTree[T](rootName: String, input: List[T], getPath: T => Path, getPathId: T => String): Node[T] = {
    val zipped = (input.map(getPath), input.map(getPathId), input).zipped.toList


    def loop(input: List[(Path, String, T)]): List[Node[T]] = {
      input
        // TODO: We could NonEmptyLists here
        .filter  { case (path, _, _) => path.nonEmpty }
        .groupBy { case (path, _, _) => path.head }
        .map { case (parentName, grouped) =>
          val nextGroup = grouped.map{ case (path, pathId, content) => (path.tail, pathId, content) }
          // TODO: Fix this hack
          val nextId = grouped.headOption map { case (_, pathId, _) => pathId } getOrElse "can't get here"
          val contentOpt = grouped.headOption flatMap { case (path, _, content) =>
            // only attach the content if we actually have it, and it's not inherited
            // from the child nodes
            if (path.size == 1) Some(content) else None
          }
          Node[T](parentName, loop(nextGroup), nextId, contentOpt)
        }
        .toList
    }

    Node[T](rootName, loop(zipped), rootName)
  }

  implicit def nodeFormat[T: Format]: Format[Node[T]] = (
    (__ \ "name").format[String] ~
    (__ \ "children").lazyFormat(Reads.list(nodeFormat[T]), Writes.list(nodeFormat[T])) ~
    (__ \ "pathId").format[String] ~
    (__ \ "content").formatNullable[T]
  )(Node.apply, unlift(Node.unapply))
}
