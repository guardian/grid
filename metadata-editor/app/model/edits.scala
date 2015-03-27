package model

import com.gu.mediaservice.model.ImageMetadata
import play.api.libs.json._
import play.api.libs.functional.syntax._

case class Edits(archived: Boolean, labels: List[String], metadata: ImageMetadata)

object Edits {
  implicit val EditsReads: Reads[Edits] = (
    (__ \ "archived").readNullable[Boolean].map(_ getOrElse false) ~
    (__ \ "labels").readNullable[List[String]].map(_ getOrElse Nil) ~
    (__ \ "metadata").readNullable[ImageMetadata].map(_ getOrElse emptyMetadata)
  )(Edits.apply _)


  implicit val EditsWrites: Writes[Edits] = (
      (__ \ "archived").write[Boolean] ~
      (__ \ "labels").write[List[String]] ~
      (__ \ "metadata").writeNullable[ImageMetadata].contramap(noneIfEmptyMetadata)
    )(unlift(Edits.unapply))


  def noneIfEmptyMetadata(m: ImageMetadata): Option[ImageMetadata] =
    if(m == emptyMetadata) None else Some(m)

  // We could set these as default on the case class, but that feel like polluting
  // the ocean instead of just polluting this little puddle.
  val emptyMetadata =
    ImageMetadata(None, None, None, None, None, None, None, None, None, None, None, List(), None, None, None, None)
}
