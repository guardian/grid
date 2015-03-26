package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class Edits(archived: Boolean, labels: List[String], rightsNotices: List[String], metadata: Metadata)

object Edits {
  implicit val EditsReads: Reads[Edits] = (
    (__ \ "archived").readNullable[Boolean].map(_ getOrElse false) ~
    (__ \ "labels").readNullable[List[String]].map(_ getOrElse Nil) ~
    (__ \ "rightsNotices").readNullable[List[String]].map(_ getOrElse Nil) ~
    (__ \ "metadata").read[Metadata]
  )(Edits(_, _, _, _))
}



case class Metadata(description: Option[String], byline: Option[String], credit: Option[String])

object Metadata {
  implicit val MetadataReads: Reads[Metadata] = (
    (__ \ "description").readNullable[String] ~
    (__ \ "byline").readNullable[String] ~
    (__ \ "credit").readNullable[String]
  )(Metadata(_, _, _))
}
