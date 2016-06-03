package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._
import com.gu.mediaservice.lib.argo.model._
import org.joda.time.DateTime

case class LeaseByMedia(
  leases: List[MediaLease],
  lastModified: Option[DateTime],
  current: Option[MediaLease]
)
case object LeaseByMedia {
  def apply(leases: List[MediaLease]): LeaseByMedia = {
    def sortLease(a: MediaLease, b: MediaLease) =
      a.createdAt.isAfter(b.createdAt)

    val sortedLeases = leases
      .sortWith(sortLease)

    val currentLease = sortedLeases
      .filter(_.active)
      .headOption

    val lastModified = sortedLeases
      .headOption
      .map(_.createdAt)

    LeaseByMedia(sortedLeases, lastModified, currentLease)
  }
}

trait LeaseByMediaWriter {
  def wrapLease(lease: MediaLease): EntityResponse[MediaLease]

  implicit val dateTimeFormat = DateFormat
  implicit val writer = new Writes[LeaseByMedia] {
    def writes(leaseByMedia: LeaseByMedia) = JsObject(
      Seq("leases" -> Json.toJson(leaseByMedia.leases.map(wrapLease))) ++
      leaseByMedia.current.map(l => "current" -> Json.toJson(wrapLease(l))) ++
      leaseByMedia.lastModified.map(m => "lastModified" -> Json.toJson(m))
    )
  }
}
