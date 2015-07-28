package com.gu.mediaservice.lib.argo.model

import java.net.URI

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.lib.argo.WriteHelpers


case class EntityReponse[T](
  uri: Option[URI] = None,
  data: T,
  links: List[Link] = Nil
)

object EntityReponse extends WriteHelpers {

  implicit def entityResponseWrites[T: Writes]: Writes[EntityReponse[T]] = (
    (__ \ "uri").writeNullable[String].contramap((_: Option[URI]).map(_.toString)) ~
      (__ \ "data").write[T] ~
      (__ \ "links").writeNullable[List[Link]].contramap(someListOrNone[Link])
    )(unlift(EntityReponse.unapply[T]))

}
