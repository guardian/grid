package com.gu.mediaservice.model

import play.api.libs.json._
import org.joda.time.DateTime
import JodaWrites._

case class LeasesByMedia(
  leases: List[MediaLease],
  lastModified: Option[DateTime]
)

object LeasesByMedia {
  import JodaReads._
  implicit val reader: Reads[LeasesByMedia] = Json.reads[LeasesByMedia]

  implicit val writer = new Writes[LeasesByMedia] {
    def writes(leaseByMedia: LeasesByMedia) = {
      LeasesByMedia.toJson(
        Json.toJson(leaseByMedia.leases),
        Json.toJson(leaseByMedia.lastModified)
      )
    }
  }

  implicit def dateTimeOrdering: Ordering[DateTime] = Ordering.fromLessThan(_ isBefore _)

  def empty = LeasesByMedia(Nil, Some(DateTime.now))

  def build (leases: List[MediaLease]) = {
    val lastModified = leases.sortBy(_.createdAt).reverse.headOption.map(_.createdAt).getOrElse(DateTime.now)
    LeasesByMedia(leases, Some(lastModified))
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
