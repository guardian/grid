package com.gu.mediaservice.lib.argo.model

import java.net.URI
import play.api.libs.json._
import play.api.libs.functional.syntax._
import com.gu.mediaservice.lib.argo.WriteHelpers
import com.sksamuel.elastic4s.requests.searches.aggs.AbstractAggregation

case class ExtraCountConfig(
  searchClause: String,
  backgroundColour: String,
  maybeSubAggregation: Option[AbstractAggregation] = None
)

case class ExtraCount(
  value: Long,
  searchClause: String,
  backgroundColour: String,
  subCounts: Option[Map[String, Long]] = None
)

case class ExtraCounts(
  tickerCounts: Map[String, ExtraCount]
)

case class CollectionResponse[T](
  uri: Option[URI] = None,
  offset: Option[Long] = None,
  length: Option[Long],
  total: Option[Long] = None,
  data: Seq[T],
  links: List[Link] = List(),
  // FIXME: the 'theseus' library used on the client mandates a strict set of top level keys, so crow-barring something else into 'actions' here (https://github.com/argo-rest/theseus [last updated 2015] needs to move into grid repo, so we can update it for this use-case and others)
  actions: Option[ExtraCounts] = None
)

object CollectionResponse extends WriteHelpers {

  implicit val extraCountWrites: Writes[ExtraCount] = Json.writes[ExtraCount]
  implicit val extraCountsWrites: Writes[ExtraCounts] = Json.writes[ExtraCounts]

  implicit def collectionResponseWrites[T: Writes]: Writes[CollectionResponse[T]] = (
    (__ \ "uri").writeNullable[String].contramap((_: Option[URI]).map(_.toString)) ~
      (__ \ "offset").writeNullable[Long] ~
      (__ \ "length").writeNullable[Long] ~
      (__ \ "total").writeNullable[Long] ~
      (__ \ "data").write[Seq[T]] ~
      (__ \ "links").writeNullable[List[Link]].contramap(someListOrNone[Link]) ~
      (__ \ "actions").writeNullable[ExtraCounts]
    )(unlift(CollectionResponse.unapply[T]))

}
