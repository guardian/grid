package com.gu.mediaservice.lib.argo.model

import java.net.URI

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.lib.argo.WriteHelpers


case class MapResponse[T](
  uri: Option[URI] = None,
  data: Map[String, T],
  links: List[Link] = List()
)

object MapResponse extends WriteHelpers {

  implicit def collectionResponseWrites[T: Writes]: Writes[MapResponse[T]] = (
    (__ \ "uri").writeNullable[String].contramap((_: Option[URI]).map(_.toString)) ~
      (__ \ "data").write[Map[String, T]] ~
      (__ \ "links").writeNullable[List[Link]].contramap(someListOrNone[Link])
    )(unlift(MapResponse.unapply[T]))

}
