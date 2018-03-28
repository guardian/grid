package com.gu.mediaservice.model


import play.api.libs.json._
import play.api.libs.functional.syntax._
import com.gu.mediaservice.lib.argo.model._
import org.joda.time.DateTime
import JodaWrites._

case class LeaseByMedia(
  leases: List[MediaLease],
  lastModified: Option[DateTime],
  current: Option[MediaLease]
)
case object LeaseByMedia {
  implicit val reader : Reads[LeaseByMedia] = (__ \ "leases").read[List[MediaLease]].map(LeaseByMedia.build(_))

  implicit val writer = new Writes[LeaseByMedia] {
    def writes(leaseByMedia: LeaseByMedia) = {
      LeaseByMedia.toJson(
        Json.toJson(leaseByMedia.leases),
        Json.toJson(leaseByMedia.current),
        Json.toJson(leaseByMedia.lastModified.map(lm => Json.toJson(lm)))
      )
    }
  }


  def build(leases: List[MediaLease]): LeaseByMedia = {
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

  def toJson(leases: JsValue, current: JsValue, lastModified: JsValue) : JsObject = {
    JsObject(
      Seq(
        "leases" -> leases,
        "current" -> current,
        "lastModified" -> lastModified
      )
    )
  }
}
