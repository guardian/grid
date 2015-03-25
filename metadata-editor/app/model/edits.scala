package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class Edits(archived: Boolean, labels: List[String], flags: List[String])

object Edits {
  implicit val EditsReads: Reads[Edits] = (
    (__ \ "archived").readNullable[Boolean].map(_ getOrElse false) ~
    (__ \ "labels").readNullable[List[String]].map(_ getOrElse Nil) ~
    (__ \ "archived").readNullable[List[String]].map(_ getOrElse Nil)
  )(Edits(_, _, _))
}



case class Metadata(description: String, byline: String, credit: String)

object Metadata {
  implicit val MetadataReads: Reads[Metadata] = Json.reads[Metadata]
}
