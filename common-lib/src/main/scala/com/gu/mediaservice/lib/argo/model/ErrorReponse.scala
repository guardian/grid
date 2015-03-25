package com.gu.mediaservice.lib.argo.model

import java.net.URI

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.lib.argo.WriteHelpers


case class ErrorReponse[T](
  uri: Option[URI] = None,
  errorKey: String,
  errorMessage: String,
  data: Option[T],
  links: List[Link] = List()
)

object ErrorReponse extends WriteHelpers {

  implicit def errorResponseWrites[T: Writes]: Writes[ErrorReponse[T]] = (
    (__ \ "uri").writeNullable[String].contramap((_: Option[URI]).map(_.toString)) ~
      (__ \ "errorKey").write[String] ~
      (__ \ "errorMessage").write[String] ~
      (__ \ "data").writeNullable[T] ~
      (__ \ "links").writeNullable[List[Link]].contramap(someListOrNone[Link])
    )(unlift(ErrorReponse.unapply[T]))

}
