package com.gu.mediaservice.model

import play.api.libs.json._
import org.joda.time.DateTime
import JodaWrites._

case class LeasesByMedia(
  leases: List[MediaLease],
  lastModified: Option[DateTime]
)

object LeasesByMedia {
  implicit val reader: Reads[LeasesByMedia] = (__ \ "leases").read[List[MediaLease]].map(LeasesByMedia.build)

  implicit val writer = new Writes[LeasesByMedia] {
    def writes(leaseByMedia: LeasesByMedia) = {
      LeasesByMedia.toJson(
        Json.toJson(leaseByMedia.leases),
        Json.toJson(leaseByMedia.lastModified.map(lm => Json.toJson(lm)))
      )
    }
  }

  implicit def dateTimeOrdering: Ordering[DateTime] = Ordering.fromLessThan(_ isBefore _)

  def build(leases: List[MediaLease]): LeasesByMedia = {
    val sortedLeases = leases.sortBy(_.createdAt).reverse

    val lastModified: Option[DateTime] = sortedLeases
      .headOption
      .map(_.createdAt)

    LeasesByMedia(sortedLeases, lastModified)
  }

  def toJson(leases: JsValue, lastModified: JsValue) : JsObject = {
    JsObject(
      Seq(
        "leases" -> leases,
        "lastModified" -> lastModified
      )
    )
  }
}
