package com.gu.mediaservice.lib.argo.model

import java.net.URI

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.lib.argo.WriteHelpers


case class CollectionResponse[T](
  uri: Option[URI] = None,
  offset: Option[Long] = None,
  length: Option[Long],
  total: Option[Long] = None,
  data: Seq[T],
  links: List[Link] = List(),
  // FIXME: the 'theseus' library used on the client mandates a strict set of top level keys, so crow-barring something else into 'actions' here (https://github.com/argo-rest/theseus [last updated 2015] needs to move into grid repo, so we can update it for this use-case and others)
  actions: Option[Long] = None
)

object CollectionResponse extends WriteHelpers {

  implicit def collectionResponseWrites[T: Writes]: Writes[CollectionResponse[T]] = (
    (__ \ "uri").writeNullable[String].contramap((_: Option[URI]).map(_.toString)) ~
      (__ \ "offset").writeNullable[Long] ~
      (__ \ "length").writeNullable[Long] ~
      (__ \ "total").writeNullable[Long] ~
      (__ \ "data").write[Seq[T]] ~
      (__ \ "links").writeNullable[List[Link]].contramap(someListOrNone[Link]) ~
      (__ \ "actions").writeNullable[Long]
    )(unlift(CollectionResponse.unapply[T]))

}
