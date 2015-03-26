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
  )(Edits.apply _)


  implicit val EditsWrites: Writes[Edits] = (
      (__ \ "archived").write[Boolean] ~
      (__ \ "labels").write[List[String]] ~
      (__ \ "rightsNotices").write[List[String]] ~
      // How
      (__ \ "metadata").write[Metadata]
    )(unlift(Edits.unapply))
}



case class Metadata(description: Option[String], byline: Option[String], credit: Option[String])

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

  def getEmpty = Metadata(None, None, None)
}
