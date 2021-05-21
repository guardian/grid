package com.gu.mediaservice.model

 import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
 import com.gu.mediaservice.model.leases.MediaLease
 import com.gu.mediaservice.model.usage.UsageNotice
 import org.joda.time.{DateTime, DateTimeZone}
 import play.api.libs.json.{JodaReads, JodaWrites, Json, __}

sealed trait ThrallMessage extends GridLogging with LogMarker {
  implicit val yourJodaDateReads = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites = JodaWrites.JodaDateTimeWrites
  def subject: () => String = () => this.getClass.getSimpleName
  val id: String
  val lastModified: DateTime
  def additionalMarkers: () => Map[String, Any] = () => Map()

  override def markerContents = {
    val message = Json.stringify(Json.toJson(this)(ThrallMessage.writes))
    Map (
      "subject" -> subject,
      "id" -> id,
      "size" -> message.getBytes.length,
      "length" -> message.length
    )
  }
}
object ThrallMessage{
  implicit val yourJodaDateReads = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites = JodaWrites.JodaDateTimeWrites

  implicit val usageNoticeFormat = Json.format[UsageNotice]

  implicit val replaceImageLeasesMessageFormat = Json.format[ReplaceImageLeasesMessage]
  implicit val deleteImageMessageFormat = Json.format[DeleteImageMessage]
  implicit val updateImageSyndicationMetadataMessageFormat = Json.format[UpdateImageSyndicationMetadataMessage]
  implicit val setImageCollectionsMessageFormat = Json.format[SetImageCollectionsMessage]
  implicit val updateImageUserMetadataMessageFormat = Json.format[UpdateImageUserMetadataMessage]
  implicit val deleteImageExportsMessageFormat = Json.format[DeleteImageExportsMessage]
  implicit val imageMessageFormat = Json.format[ImageMessage]
  implicit val updateImagePhotoshootMetadataMessage = Json.format[UpdateImagePhotoshootMetadataMessage]
  implicit val deleteUsagesMessage = Json.format[DeleteUsagesMessage]
  implicit val updateImageUsagesMessage = Json.format[UpdateImageUsagesMessage]
  implicit val addImageLeaseMessage = Json.format[AddImageLeaseMessage]
  implicit val removeImageLeaseMessage = Json.format[RemoveImageLeaseMessage]
  implicit val updateImageExportsMessage = Json.format[UpdateImageExportsMessage]
  implicit val writes = Json.writes[ThrallMessage]

}



case class ImageMessage(id: String, lastModified: DateTime, image: Image) extends ThrallMessage {
  override def additionalMarkers: () => Map[String, Any] = ()=>
    Map("fileName" -> image.source.file.toString)
}

case class DeleteImageMessage(id: String, lastModified: DateTime) extends ThrallMessage

case class DeleteImageExportsMessage(id: String, lastModified: DateTime) extends ThrallMessage

case class UpdateImageExportsMessage(id: String, lastModified: DateTime, crops: Seq[Crop]) extends ThrallMessage

case class UpdateImageUserMetadataMessage(id: String, lastModified: DateTime, edits: Edits) extends ThrallMessage

case class UpdateImageUsagesMessage(id: String, lastModified: DateTime, usageNotice: UsageNotice) extends ThrallMessage

case class ReplaceImageLeasesMessage(id: String, lastModified: DateTime, leases: Seq[MediaLease]) extends ThrallMessage

case class AddImageLeaseMessage(id: String, lastModified: DateTime, lease: MediaLease) extends ThrallMessage

case class RemoveImageLeaseMessage(id: String, lastModified: DateTime, leaseId: String) extends ThrallMessage

case class SetImageCollectionsMessage(id: String, lastModified: DateTime, collections: Seq[Collection]) extends ThrallMessage

case class DeleteUsagesMessage(id: String, lastModified: DateTime) extends ThrallMessage

object DeleteUsagesMessage {
  implicit val yourJodaDateReads = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites = JodaWrites.JodaDateTimeWrites
  implicit val what = Json.format[DeleteUsagesMessage]
}

case class UpdateImageSyndicationMetadataMessage(id: String, lastModified: DateTime, syndicationRights: SyndicationRights) extends ThrallMessage
//TODO: This might actually should be an option of synd rights.

case class UpdateImagePhotoshootMetadataMessage(id: String, lastModified: DateTime, edits: Edits) extends ThrallMessage



