package com.gu.mediaservice.lib.argo.model

import java.net.URI
import play.api.libs.json._
import play.api.libs.functional.syntax._
import com.gu.mediaservice.lib.argo.WriteHelpers
import com.gu.mediaservice.model.FilterPanelStuff


case class CollectionResponse[T](
  uri: Option[URI] = None,
  offset: Option[Long] = None,
  length: Option[Long],
  total: Option[Long] = None,
  data: Seq[T],
  links: List[Link] = List(),
  actions: Option[FilterPanelStuff] = None,
)

object CollectionResponse extends WriteHelpers {

  implicit def collectionResponseWrites[T: Writes]: Writes[CollectionResponse[T]] = (
    (__ \ "uri").writeNullable[String].contramap((_: Option[URI]).map(_.toString)) ~
      (__ \ "offset").writeNullable[Long] ~
      (__ \ "length").writeNullable[Long] ~
      (__ \ "total").writeNullable[Long] ~
      (__ \ "data").write[Seq[T]] ~
      (__ \ "links").writeNullable[List[Link]].contramap(someListOrNone[Link]) ~
      (__ \ "actions").writeNullable[FilterPanelStuff]
    )(unlift(CollectionResponse.unapply[T]))

}
