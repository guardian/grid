package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._

import org.joda.time.DateTime


sealed trait MediaLeaseType { def name: String }
object MediaLeaseType {
  implicit val reads: Reads[MediaLeaseType] = JsPath.read[String].map(MediaLeaseType(_))

  implicit val writer = new Writes[MediaLeaseType] {
    def writes(mediaLeaseType: MediaLeaseType) = JsString(mediaLeaseType.toString)
  }

  def apply(leaseType: String): MediaLeaseType = leaseType match {
    case "allow" => AllowUseLease
    case _ => DenyUseLease
  }
}
case object AllowUseLease extends MediaLeaseType { val name = "allow" }
case object DenyUseLease extends MediaLeaseType { val name = "deny" }

case class MediaLease(
  id: Option[String],
  leasedBy: Option[String],
  startDate: Option[DateTime] = None,
  endDate: Option[DateTime] = None,
  access: MediaLeaseType = AllowUseLease,
  notes: Option[String],
  mediaId: String,
  createdAt: DateTime = new DateTime()
) {
  private def afterStart = startDate.map(start => (new DateTime()).isAfter(start)).getOrElse(true)
  private def beforeEnd  = endDate.map(end => (new DateTime()).isBefore(end)).getOrElse(true)

  def active = afterStart && beforeEnd
}
case object MediaLease {
  implicit val dateTimeFormat = DateFormat
  implicit val MediaLeaseReads = Json.reads[MediaLease]

  val MediaLeasePlainWrites = Json.writes[MediaLease]

  implicit val MediaLeaseWrites = new Writes[MediaLease] {
    def writes(mediaLease: MediaLease) =
      Json.toJson(mediaLease)(MediaLeasePlainWrites).as[JsObject] +
        ("active" -> JsBoolean(mediaLease.active))
  }


}
