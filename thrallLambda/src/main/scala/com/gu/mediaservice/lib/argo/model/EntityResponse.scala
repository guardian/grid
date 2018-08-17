package com.gu.mediaservice.lib.argo.model

import java.net.URI

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.lib.argo.WriteHelpers


case class EntityResponse[T](
  uri: Option[URI] = None,
  data: T,
  links: List[Link] = Nil,
  actions: List[Action] = Nil
)

object EntityResponse extends WriteHelpers {

  implicit def entityResponseWrites[T: Writes]: Writes[EntityResponse[T]] = (
    (__ \ "uri").writeNullable[String].contramap((_: Option[URI]).map(_.toString)) ~
      (__ \ "data").write[T] ~
      (__ \ "links").writeNullable[List[Link]].contramap(someListOrNone[Link]) ~
      (__ \ "actions").writeNullable[List[Action]].contramap(someListOrNone[Action])
    )(unlift(EntityResponse.unapply[T]))

}
