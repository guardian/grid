package com.gu.mediaservice.model

 import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
 import com.gu.mediaservice.model.leases.MediaLease
 import com.gu.mediaservice.model.usage.UsageNotice
 import org.joda.time.DateTimeZone
 import play.api.libs.json.{JodaReads, JodaWrites, Json, __}

sealed trait ThrallMessage extends GridLogging with LogMarker {
  implicit val yourJodaDateReads = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites = JodaWrites.JodaDateTimeWrites
  implicit val writes = Json.writes[ThrallMessage]

  def subject: () => String = () => this.getClass.getSimpleName
  val id: String
  def additionalMarkers: () => Map[String, Any] = () => Map()

  override def markerContents = {
    val message = Json.stringify(Json.toJson(this))
    Map (
      "subject" -> subject,
      "id" -> id,
      "size" -> message.getBytes.length,
      "length" -> message.length
    )
  }
}

case class NewImageMessage(id: String, image: Image) extends ThrallMessage {
  override def additionalMarkers: () => Map[String, Any] = ()=>
    Map("fileName" -> image.source.file.toString)
}

case class DeleteImageMessage(id: String) extends ThrallMessage

case class DeleteImageExportsMessage(id: String) extends ThrallMessage

case class UpdateImageExportsMessage(id: String, crops: Seq[Crop]) extends ThrallMessage

case class UpdateImageUserMetadataMessage(id: String, edits: Edits) extends ThrallMessage

case class UpdateImageUsages(id: String, usageNotice: UsageNotice) extends ThrallMessage

object UpdateImageUsages{
  implicit val unw = Json.writes[UsageNotice]
  implicit val unr = Json.reads[UsageNotice]
}

case class ReplaceImageLeasesMessage(id: String, leases: Seq[MediaLease]) extends ThrallMessage

case class AddImageLeaseMessage(id: String, lease: MediaLease) extends ThrallMessage

case class RemoveImageLeaseMessage(id: String, leaseId: String) extends ThrallMessage

case class SetImageCollectionsMessage(id: String, collections: Seq[Collection]) extends ThrallMessage

case class DeleteUsagesMessage(id: String) extends ThrallMessage

case class UpdateImageSyndicationMetadataMessage(id: String, syndicationRights: SyndicationRights) extends ThrallMessage

case class UpdateImagePhotoshootMetadataMessage(id: String, edits: Edits) extends ThrallMessage



