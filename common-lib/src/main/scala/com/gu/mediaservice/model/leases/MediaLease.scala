package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._

import org.joda.time.DateTime
import JodaWrites._
import JodaReads._


sealed trait MediaLeaseType { def name: String }
object MediaLeaseType {
  implicit val reads: Reads[MediaLeaseType] = {
    JsPath.read[String].map {
      case "allow" => AllowUseLease
      case "deny" => DenyUseLease
    }
  }

  implicit val writer: Writes[MediaLeaseType] = new Writes[MediaLeaseType] {
    def writes(mediaLeaseType: MediaLeaseType) = JsString(mediaLeaseType.name)
  }

  def apply(leaseType: String): MediaLeaseType = leaseType match {
    case "AllowUseLease" => AllowUseLease
    case "DenyUseLease" => DenyUseLease
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
  implicit val MediaLeaseReads = Json.reads[MediaLease]

  val MediaLeasePlainWrites = Json.writes[MediaLease]

  implicit val MediaLeaseWrites = new Writes[MediaLease] {
    def writes(mediaLease: MediaLease) =
      Json.toJson(mediaLease)(MediaLeasePlainWrites).as[JsObject] +
        ("active" -> JsBoolean(mediaLease.active))
  }


}
