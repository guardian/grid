package model

import org.joda.time.DateTime

import play.api.libs.json._
import play.api.libs.functional.syntax._


case class Collection(path: List[String], paradata: Paradata)
object Collection {
  implicit def formats: Format[Collection] = Json.format[Collection]
}

case class Paradata(who: String, when: DateTime)
object Paradata {
  implicit def formats: Format[Paradata] = Json.format[Paradata]
  implicit val dateWrites = Writes.jodaDateWrites("yyyy-MM-dd'T'HH:mm:ss.SSSZ")
  implicit val dateReads = Reads.jodaDateReads("yyyy-MM-dd'T'HH:mm:ss.SSSZ")
}

case class Node[T](name: String, children: List[Node[T]], data: Option[T] = None)
object Node {
  type Path = List[String]

  def buildTree[T](rootName: String, input: List[T], getPath: T => Path): Node[T] = {
    val paths = input.map(getPath)

    def loop(input: List[Path]): List[Node[T]] = {
      input
        .filter(_.nonEmpty).groupBy(_.head)
        .map { case (parentName, children) =>
          Node[T](parentName, loop(children.map(_.tail)))
        }
        .toList
    }

    Node[T](rootName, loop(paths))
  }

  implicit def nodeFormat[T: Format]: Format[Node[T]] = (
    (__ \ "name").format[String] ~
    (__ \ "children").lazyFormat(Reads.list(nodeFormat[T]), Writes.list(nodeFormat[T])) ~
    (__ \ "data").formatNullable[T]
  )(Node.apply, unlift(Node.unapply))
}
