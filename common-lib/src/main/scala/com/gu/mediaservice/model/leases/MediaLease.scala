package com.gu.mediaservice.model.leases

import play.api.libs.json._
import org.joda.time.DateTime
import JodaWrites._
import JodaReads._
import com.gu.mediaservice.lib.formatting.printDateTime

sealed trait MediaLeaseType { def name: String }
object MediaLeaseType {
  implicit val reads: Reads[MediaLeaseType] = {
    JsPath.read[String].map {
      case "allow-use"          => AllowUseLease
      case "deny-use"           => DenyUseLease
      case "allow-syndication"  => AllowSyndicationLease
      case "deny-syndication"   => DenySyndicationLease

      // legacy values before syndication leases existed
      case "allow"              => AllowUseLease
      case "deny"               => DenyUseLease
    }
  }

  implicit val writer: Writes[MediaLeaseType] = (mediaLeaseType: MediaLeaseType) => JsString(mediaLeaseType.name)

  def apply(leaseType: String): MediaLeaseType = leaseType match {
    case "AllowUseLease" => AllowUseLease
    case "DenyUseLease" => DenyUseLease
    case "AllowSyndicationLease" => AllowSyndicationLease
    case "DenySyndicationLease" => DenySyndicationLease
  }
}
case object AllowUseLease extends MediaLeaseType { val name = "allow-use" }
case object DenyUseLease extends MediaLeaseType { val name = "deny-use" }
case object AllowSyndicationLease extends MediaLeaseType { val name = "allow-syndication" }
case object DenySyndicationLease extends MediaLeaseType { val name = "deny-syndication" }

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
  private def afterStart = startDate.forall(start => new DateTime().isAfter(start))
  private def beforeEnd  = endDate.forall(end => new DateTime().isBefore(end))

  private def withValidNotesField: MediaLease = notes match {
    case Some(note) if note.trim.length == 0 => this.copy(notes = None) // cannot save empty string in dynamo
    case _ => this
  }

  private def withValidEndDateField: MediaLease =
    if (access == AllowSyndicationLease) this.copy(endDate = None) // an allow-syndication cannot end
    else this

  private def withValidStartDateField: MediaLease =
    if (access == DenySyndicationLease) this.copy(startDate = None) // a deny-syndication cannot start
    else this

  def prepareForSave: MediaLease = this
    .withValidNotesField
    .withValidStartDateField
    .withValidEndDateField

  def active = afterStart && beforeEnd

  def isSyndication = access == AllowSyndicationLease || access == DenySyndicationLease

  def isUse = access == AllowUseLease || access == DenyUseLease
}

object MediaLease {
  implicit val MediaLeaseReads: Reads[MediaLease] = Json.reads[MediaLease]

  val MediaLeasePlainWrites: OWrites[MediaLease] = Json.writes[MediaLease]

  implicit val MediaLeaseWrites: Writes[MediaLease] = (mediaLease: MediaLease) =>
    Json.toJson(mediaLease)(MediaLeasePlainWrites).as[JsObject] + ("active" -> JsBoolean(mediaLease.active))

  def toJson(lease: MediaLease): JsValue = Json.obj(
    "id" -> lease.mediaId,
    "data" -> Json.toJson(lease),
    "lastModified" -> printDateTime(DateTime.now())
  )
}
