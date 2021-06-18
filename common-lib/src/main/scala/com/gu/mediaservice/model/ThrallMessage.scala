package com.gu.mediaservice.model

 import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
 import com.gu.mediaservice.model.leases.MediaLease
 import com.gu.mediaservice.model.usage.UsageNotice
 import org.joda.time.{DateTime, DateTimeZone}
 import play.api.libs.json
 import play.api.libs.json.{JodaReads, JodaWrites, Json, OFormat, OWrites, Reads, __}

sealed trait ThrallMessage extends GridLogging with LogMarker {
  val subject: String = this.getClass.getSimpleName()
  val id: String
  val lastModified: DateTime
  val additionalMarkers: Map[String, Any] = Map()
  def toJson = Json.toJson(this)

  override def markerContents = {
    val message = Json.stringify(Json.toJson(this)(ThrallMessage.formats))
    Map (
      "subject" -> subject,
      "id" -> id,
      "size" -> message.getBytes.length,
      "length" -> message.length
    )
  }
}
object ThrallMessage{
  implicit val yourJodaDateReads: Reads[DateTime] = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites: json.JodaWrites.JodaDateTimeWrites.type = JodaWrites.JodaDateTimeWrites

  implicit val usageNoticeFormat: OFormat[UsageNotice] = Json.format[UsageNotice]
  implicit val replaceImageLeasesMessageFormat: OFormat[ReplaceImageLeasesMessage] = Json.format[ReplaceImageLeasesMessage]
  implicit val deleteImageMessageFormat: OFormat[DeleteImageMessage] = Json.format[DeleteImageMessage]
  implicit val softDeleteImageMessageFormat: OFormat[SoftDeleteImageMessage] = Json.format[SoftDeleteImageMessage]
  implicit val updateImageSyndicationMetadataMessageFormat: OFormat[UpdateImageSyndicationMetadataMessage] = Json.format[UpdateImageSyndicationMetadataMessage]
  implicit val setImageCollectionsMessageFormat: OFormat[SetImageCollectionsMessage] = Json.format[SetImageCollectionsMessage]
  implicit val updateImageUserMetadataMessageFormat: OFormat[UpdateImageUserMetadataMessage] = Json.format[UpdateImageUserMetadataMessage]
  implicit val deleteImageExportsMessageFormat: OFormat[DeleteImageExportsMessage] = Json.format[DeleteImageExportsMessage]
  implicit val imageMessageFormat: OFormat[ImageMessage] = Json.format[ImageMessage]
  implicit val updateImagePhotoshootMetadataMessage: OFormat[UpdateImagePhotoshootMetadataMessage] = Json.format[UpdateImagePhotoshootMetadataMessage]
  implicit val deleteUsagesMessage: OFormat[DeleteUsagesMessage] = Json.format[DeleteUsagesMessage]
  implicit val updateImageUsagesMessage: OFormat[UpdateImageUsagesMessage] = Json.format[UpdateImageUsagesMessage]
  implicit val addImageLeaseMessage: OFormat[AddImageLeaseMessage] = Json.format[AddImageLeaseMessage]
  implicit val removeImageLeaseMessage: OFormat[RemoveImageLeaseMessage] = Json.format[RemoveImageLeaseMessage]
  implicit val updateImageExportsMessage: OFormat[UpdateImageExportsMessage] = Json.format[UpdateImageExportsMessage]
  implicit val formats: OFormat[ThrallMessage] = Json.format[ThrallMessage]
}



case class ImageMessage(lastModified: DateTime, image: Image) extends ThrallMessage {
  override val additionalMarkers = {
    Map("fileName" -> image.source.file.toString)
  }
  override val id = image.id
}

case class DeleteImageMessage(id: String, lastModified: DateTime) extends ThrallMessage

case class SoftDeleteImageMessage(id: String, lastModified: DateTime, softDeletedMetadata: SoftDeletedMetadata) extends ThrallMessage

case class DeleteImageExportsMessage(id: String, lastModified: DateTime) extends ThrallMessage

case class UpdateImageExportsMessage(id: String, lastModified: DateTime, crops: Seq[Crop]) extends ThrallMessage

case class UpdateImageUserMetadataMessage(id: String, lastModified: DateTime, edits: Edits) extends ThrallMessage

case class UpdateImageUsagesMessage(id: String, lastModified: DateTime, usageNotice: UsageNotice) extends ThrallMessage

case class ReplaceImageLeasesMessage(id: String, lastModified: DateTime, leases: Seq[MediaLease]) extends ThrallMessage

case class AddImageLeaseMessage(id: String, lastModified: DateTime, lease: MediaLease) extends ThrallMessage

case class RemoveImageLeaseMessage(id: String, lastModified: DateTime, leaseId: String) extends ThrallMessage

case class SetImageCollectionsMessage(id: String, lastModified: DateTime, collections: Seq[Collection]) extends ThrallMessage

case class DeleteUsagesMessage(id: String, lastModified: DateTime) extends ThrallMessage

case class UpdateImageSyndicationMetadataMessage(id: String, lastModified: DateTime, maybeSyndicationRights: Option[SyndicationRights]) extends ThrallMessage

case class UpdateImagePhotoshootMetadataMessage(id: String, lastModified: DateTime, edits: Edits) extends ThrallMessage



