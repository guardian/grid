package com.gu.mediaservice.model.leases

import play.api.libs.json._
import org.joda.time.DateTime
import JodaWrites._

case class LeasesByMedia private[leases] (
  leases: List[MediaLease],
  lastModified: Option[DateTime]
)

object LeasesByMedia {
  import JodaReads._
  implicit val reader: Reads[LeasesByMedia] = Json.reads[LeasesByMedia]

  implicit val writer = new Writes[LeasesByMedia] {
    def writes(leaseByMedia: LeasesByMedia) = {
      Json.obj(
        "leases" -> leaseByMedia.leases,
        "lastModified" -> leaseByMedia.lastModified
      )
    }
  }

  implicit def dateTimeOrdering: Ordering[DateTime] = Ordering.fromLessThan(_ isBefore _)

  def empty = LeasesByMedia(Nil, None)

  private[leases] def apply(leases: List[MediaLease], lastModified: Option[DateTime]): LeasesByMedia = new LeasesByMedia(leases, lastModified)

  def build (leases: List[MediaLease]) = {
    val lastModified = leases.sortBy(_.createdAt).reverse.headOption.map(_.createdAt)
    LeasesByMedia(leases, lastModified)
  }
}
