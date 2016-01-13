package com.gu.mediaservice.lib.argo.model

import java.net.URI

import play.api.libs.json._
import play.api.libs.functional.syntax._


// TODO: add specification of parameters and body structure, mimeType
case class Action(name: String, href: URI, method: String)

object Action {
  implicit val actionReads: Reads[Action] = (
    (__ \ "name").read[String] ~
    (__ \ "href").read[String].map(URI.create) ~
    (__ \ "method").read[String]
  )(Action.apply _)


  implicit val actionWrites: Writes[Action] = (
    (__ \ "name").write[String] ~
      (__ \ "href").write[String].contramap((_: URI).toString) ~
      (__ \ "method").write[String]
    )(unlift(Action.unapply))

}
