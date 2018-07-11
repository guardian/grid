package com.gu.mediaservice.model

import com.gu.mediaservice.lib.formatting.{parseDateTime, printOptDateTime}
import org.joda.time.DateTime
import play.api.libs.json.Reads
import play.api.libs.json._
import play.api.libs.functional.syntax._

case class Photoshoot(
  id: String,
  title: String,
  createdAt: Option[DateTime]
)

object Photoshoot {
  implicit val reads: Reads[Photoshoot] = (
    (__ \ "id").read[String] ~
    (__ \ "title").read[String] ~
    (__ \ "createdAt").readNullable[String].map(_.flatMap(parseDateTime))
  )(Photoshoot.apply _)

  implicit val writes: Writes[Photoshoot] = (
    (__ \ "id").write[String] ~
    (__ \ "title").write[String] ~
    (__ \ "createdAt").writeNullable[String].contramap(printOptDateTime)
  )(unlift(Photoshoot.unapply))
}
