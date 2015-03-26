package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class Edits(archived: Boolean, labels: List[String], rightsNotices: List[String], metadata: Metadata)

object Edits {
  implicit val EditsReads: Reads[Edits] = (
    (__ \ "archived").readNullable[Boolean].map(_ getOrElse false) ~
    (__ \ "labels").readNullable[List[String]].map(_ getOrElse Nil) ~
    (__ \ "rightsNotices").readNullable[List[String]].map(_ getOrElse Nil) ~
    (__ \ "metadata").readNullable[Metadata].map(_ getOrElse Metadata())
  )(Edits.apply _)


  implicit val EditsWrites: Writes[Edits] = (
      (__ \ "archived").write[Boolean] ~
      (__ \ "labels").write[List[String]] ~
      (__ \ "rightsNotices").write[List[String]] ~
      (__ \ "metadata").writeNullable[Metadata].contramap(noneIfEmptyMetadata)
    )(unlift(Edits.unapply))

  def noneIfEmptyMetadata(m: Metadata) = if(m.isEmpty) None else Some(m)
}




// work with Picdar extra fields eg copyright
case class Metadata(
  description: Option[String] = None,
  byline: Option[String] = None,
  credit: Option[String] = None
) {
  def isEmpty = description.isEmpty && byline.isEmpty && credit.isEmpty
}

object Metadata {
  implicit val MetadataReads: Reads[Metadata] = (
    (__ \ "description").readNullable[String] ~
    (__ \ "byline").readNullable[String] ~
    (__ \ "credit").readNullable[String]
  )(Metadata(_, _, _))


  implicit val MetadataWrites: Writes[Metadata] = (
    (__ \ "description").writeNullable[String] ~
    (__ \ "byline").writeNullable[String] ~
    (__ \ "credit").writeNullable[String]
  )(unlift(Metadata.unapply))
}
