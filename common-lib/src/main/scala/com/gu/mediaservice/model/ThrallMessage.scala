package com.gu.mediaservice.model

import com.gu.mediaservice.model.leases.MediaLease
import com.gu.mediaservice.model.usage.UsageNotice
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.json.{JodaReads, JodaWrites, JsValue, Json, OFormat, OWrites, Reads, Writes}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import org.joda.time.format.DateTimeFormat

sealed trait ThrallMessage extends GridLogging with LogMarker {
  val subject: String = this.getClass.getSimpleName
  def additionalMarkers: () => Map[String, Any] = () => Map()

  override def markerContents: Map[String, Any] = {
    Map (
      "subject" -> subject
    )
  }
}

/**
  * INTERNAL THRALL MESSAGES (these never leave Thrall)
  */
sealed trait InternalThrallMessage extends ThrallMessage {}

sealed trait MigrationMessage extends InternalThrallMessage {}

case class MigrateImageMessage(id: String, maybeImageWithVersion: Either[String, (Image, Long)]) extends MigrationMessage

object MigrateImageMessage {
  def apply(imageId: String, maybeProjection: Option[Image], maybeVersion: Option[Long]): MigrateImageMessage = (maybeProjection, maybeVersion) match {
    case (Some(projection), Some(version)) => MigrateImageMessage(imageId, scala.Right((projection, version)))
    case (None, _) => MigrateImageMessage(imageId, Left("There was no projection returned"))
    case _ => MigrateImageMessage(imageId, Left("There was no version returned"))
  }
}


/**
  * EXTERNAL THRALL MESSAGES (these go over Kinesis)
  */

sealed trait ExternalThrallMessage extends ThrallMessage {
  implicit val yourJodaDateReads: Reads[DateTime] = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites: Writes[DateTime] = JodaWrites.JodaDateTimeWrites
  val id: String
  val lastModified: DateTime
  val instance: String
  def toJson: JsValue = Json.toJson(this)(ExternalThrallMessage.writes)

  override def markerContents: Map[String, Any] = {
    val message = Json.stringify(toJson)
    super.markerContents ++ Map (
      "id" -> id,
      "size" -> message.getBytes.length,
      "length" -> message.length
    )
  }
}

object ExternalThrallMessage{
  implicit val yourJodaDateReads: Reads[DateTime] = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites: Writes[DateTime] = JodaWrites.JodaDateTimeWrites

  implicit val usageNoticeFormat: OFormat[UsageNotice] = Json.format[UsageNotice]

  implicit val replaceImageLeasesMessageFormat: OFormat[ReplaceImageLeasesMessage] = Json.format[ReplaceImageLeasesMessage]
  implicit val deleteImageMessageFormat: OFormat[DeleteImageMessage] = Json.format[DeleteImageMessage]
  implicit val updateImageSyndicationMetadataMessageFormat: OFormat[UpdateImageSyndicationMetadataMessage] = Json.format[UpdateImageSyndicationMetadataMessage]
  implicit val setImageCollectionsMessageFormat: OFormat[SetImageCollectionsMessage] = Json.format[SetImageCollectionsMessage]
  implicit val updateImageUserMetadataMessageFormat: OFormat[UpdateImageUserMetadataMessage] = Json.format[UpdateImageUserMetadataMessage]
  implicit val deleteImageExportsMessageFormat: OFormat[DeleteImageExportsMessage] = Json.format[DeleteImageExportsMessage]
  implicit val softDeleteImageMessageFormat: OFormat[SoftDeleteImageMessage] = Json.format[SoftDeleteImageMessage]
  implicit val unSoftDeleteImageMessageFormat: OFormat[UnSoftDeleteImageMessage] = Json.format[UnSoftDeleteImageMessage]
  implicit val imageMessageFormat: OFormat[ImageMessage] = Json.format[ImageMessage]
  implicit val updateImagePhotoshootMetadataMessage: OFormat[UpdateImagePhotoshootMetadataMessage] = Json.format[UpdateImagePhotoshootMetadataMessage]
  implicit val deleteUsagesMessage: OFormat[DeleteUsagesMessage] = Json.format[DeleteUsagesMessage]
  implicit val deleteSingleUsageMessage: OFormat[DeleteSingleUsageMessage] = Json.format[DeleteSingleUsageMessage]
  implicit val updateUsageStatusMessage: OFormat[UpdateUsageStatusMessage] = Json.format[UpdateUsageStatusMessage]
  implicit val updateImageUsagesMessage: OFormat[UpdateImageUsagesMessage] = Json.format[UpdateImageUsagesMessage]
  implicit val addImageLeaseMessage: OFormat[AddImageLeaseMessage] = Json.format[AddImageLeaseMessage]
  implicit val removeImageLeaseMessage: OFormat[RemoveImageLeaseMessage] = Json.format[RemoveImageLeaseMessage]
  implicit val updateImageExportsMessage: OFormat[UpdateImageExportsMessage] = Json.format[UpdateImageExportsMessage]

  implicit val createMigrationIndexMessage: OFormat[CreateMigrationIndexMessage] = Json.format[CreateMigrationIndexMessage]
  implicit val completeMigrationMessage: OFormat[CompleteMigrationMessage] = Json.format[CompleteMigrationMessage]
  implicit val upsertFromProjectionMessage: OFormat[UpsertFromProjectionMessage] = Json.format[UpsertFromProjectionMessage]

  implicit val writes: OWrites[ExternalThrallMessage] = Json.writes[ExternalThrallMessage]
  implicit val reads: Reads[ExternalThrallMessage] = Json.reads[ExternalThrallMessage]

}


case class ImageMessage(lastModified: DateTime, image: Image, instance: String) extends ExternalThrallMessage {
  override def additionalMarkers: () => Map[String, Any] = ()=>
    Map("fileName" -> image.source.file.toString)

  override val id: String = image.id
}

case class DeleteImageMessage(id: String, lastModified: DateTime, instance: String) extends ExternalThrallMessage

case class SoftDeleteImageMessage(id: String, lastModified: DateTime, softDeletedMetadata: SoftDeletedMetadata, instance: String) extends ExternalThrallMessage

case class UnSoftDeleteImageMessage(id: String, lastModified: DateTime, instance: String) extends ExternalThrallMessage

case class DeleteImageExportsMessage(id: String, lastModified: DateTime, instance: String) extends ExternalThrallMessage

case class UpdateImageExportsMessage(id: String, lastModified: DateTime, crops: Seq[Crop], instance: String) extends ExternalThrallMessage

case class UpdateImageUserMetadataMessage(id: String, lastModified: DateTime, edits: Edits, instance: String) extends ExternalThrallMessage

case class UpdateImageUsagesMessage(id: String, lastModified: DateTime, usageNotice: UsageNotice, instance: String) extends ExternalThrallMessage

case class ReplaceImageLeasesMessage(id: String, lastModified: DateTime, leases: Seq[MediaLease], instance: String) extends ExternalThrallMessage

case class AddImageLeaseMessage(id: String, lastModified: DateTime, lease: MediaLease, instance: String) extends ExternalThrallMessage

case class RemoveImageLeaseMessage(id: String, lastModified: DateTime, leaseId: String, instance: String) extends ExternalThrallMessage

case class SetImageCollectionsMessage(id: String, lastModified: DateTime, collections: Seq[Collection], instance: String) extends ExternalThrallMessage

case class DeleteSingleUsageMessage(id: String, lastModified: DateTime, usageId: String, instance: String) extends ExternalThrallMessage

case class DeleteUsagesMessage(id: String, lastModified: DateTime, instance: String) extends ExternalThrallMessage

case class UpdateUsageStatusMessage(id: String, usageNotice: UsageNotice, lastModified: DateTime, instance: String) extends ExternalThrallMessage

object DeleteUsagesMessage {
  implicit val yourJodaDateReads: Reads[DateTime] = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites: Writes[DateTime] = JodaWrites.JodaDateTimeWrites
  implicit val what: OFormat[DeleteUsagesMessage] = Json.format[DeleteUsagesMessage]
}

case class UpdateImageSyndicationMetadataMessage(id: String, lastModified: DateTime, maybeSyndicationRights: Option[SyndicationRights], instance: String) extends ExternalThrallMessage

case class UpdateImagePhotoshootMetadataMessage(id: String, lastModified: DateTime, edits: Edits, instance: String) extends ExternalThrallMessage

/**
  * Message to start a new 'migration' (for re-index, re-ingestion etc.)
  * @param migrationStart timestamp representing when a migration commenced
  * @param gitHash the git commit hash (of the grid repo) at the point the migration commenced
  */
case class CreateMigrationIndexMessage(
  migrationStart: DateTime,
  gitHash: String,
  instance: String
) extends ExternalThrallMessage {
  val id: String = "N/A"
  val lastModified: DateTime = migrationStart

  val newIndexName =
    s"images_${migrationStart.toString(DateTimeFormat.forPattern("yyyy-MM-dd_HH-mm-ss").withZoneUTC())}_${gitHash.take(7)}"
}

case class UpsertFromProjectionMessage(id: String, image: Image, lastModified: DateTime, instance: String) extends ExternalThrallMessage

case class CompleteMigrationMessage(lastModified: DateTime, instance: String) extends ExternalThrallMessage {
  val id: String = "N/A"
}
