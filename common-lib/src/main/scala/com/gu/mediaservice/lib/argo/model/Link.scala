package com.gu.mediaservice.lib.argo.model

import play.api.libs.json._
import play.api.libs.functional.syntax._


// TODO: or uri template?
case class Link(rel: String, href: String)

object Link {

  implicit val linkWrites: Writes[Link] = (
    (__ \ "rel").write[String] ~
      (__ \ "href").write[String]
    )(unlift(Link.unapply))

}
