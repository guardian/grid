package model

import play.api.libs.functional.syntax._
import play.api.libs.json._

// TODO: Convert fullPath to NonEmptylist
case class Node[T](basename: String, children: List[Node[T]], fullPath: List[String], correctPath: List[String], data: Option[T]) {
  // This is a hackmap that should map from T => V
  def hackmap[V](f: Node[T] => Node[V]): Node[V] = {
    val newNode = f(this)
    val newChilds = children.map(child => child.hackmap(f))

    newNode.copy(children = newChilds)
  }

  def toList(acc: List[T] = Nil): List[T] = {
    val dataList = data map (List(_)) getOrElse Nil
    val dataChilds = children.flatMap(_.toList(dataList))
    dataList ++ dataChilds
  }
}
object Node {
  def fromList[T](list: List[T], getPath: T => List[String], getCorrectPathBit: T => String): Node[T] = {
    // returns children for a given path
    def loop(ts: List[T], fullPath: List[String], correctPath: List[String]): List[Node[T]] = {
      ts
        // group by slug at current level
        .groupBy(getPath(_).drop(fullPath.size).head)
        .toList
        .map { case (currentSlug, tsWithThisSlug) =>
          // separate `T` at this level from its children
          val (thisLevel, children) = tsWithThisSlug.partition { t =>
            getPath(t).size == fullPath.size + 1
          }
          val thisFullPath = fullPath :+ currentSlug
          val thisCorrectPath = thisLevel.headOption.map(getCorrectPathBit).map(c => correctPath :+ c).getOrElse(Nil)


          // use the T at this level or an empty node to hold children
          Node(currentSlug, loop(children, thisFullPath, thisCorrectPath), thisFullPath, thisCorrectPath, thisLevel.headOption)
        }
        .sortBy(node => (node.children.isEmpty, node.basename))
    }
    Node[T]("root", loop(list, Nil, Nil), Nil, Nil, None)
  }

  implicit def nodeFormat[T: Format]: Format[Node[T]] = (
    (__ \ "basename").format[String] ~
    (__ \ "children").lazyFormat(Reads.list(nodeFormat[T]), Writes.list(nodeFormat[T])) ~
    (__ \ "fullPath").format[List[String]] ~
    (__ \ "correctPath").format[List[String]] ~
    (__ \ "data").formatNullable[T]
  )(Node.apply, unlift(Node.unapply))
}
