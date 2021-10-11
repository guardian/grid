package com.gu.mediaservice.model

import com.gu.mediaservice.model.leases.MediaLease
import com.gu.mediaservice.model.usage.UsageNotice
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.json
import play.api.libs.json.{JodaReads, JodaWrites, JsValue, Json, Reads}
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
    case (None, _) => MigrateImageMessage(imageId, Left(s"There was no projection returned for id: ${imageId}"))
    case _ => MigrateImageMessage(imageId, Left(s"There was no version returned for id: ${imageId}"))
  }
}

/**
  * EXTERNAL THRALL MESSAGES (these go over Kinesis)
  */

sealed trait ExternalThrallMessage extends ThrallMessage {
  implicit val yourJodaDateReads: Reads[DateTime] = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites: json.JodaWrites.JodaDateTimeWrites.type = JodaWrites.JodaDateTimeWrites
  val id: String
  val lastModified: DateTime
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
  implicit val yourJodaDateReads = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites = JodaWrites.JodaDateTimeWrites

  implicit val usageNoticeFormat = Json.format[UsageNotice]

  implicit val replaceImageLeasesMessageFormat = Json.format[ReplaceImageLeasesMessage]
  implicit val deleteImageMessageFormat = Json.format[DeleteImageMessage]
  implicit val updateImageSyndicationMetadataMessageFormat = Json.format[UpdateImageSyndicationMetadataMessage]
  implicit val setImageCollectionsMessageFormat = Json.format[SetImageCollectionsMessage]
  implicit val updateImageUserMetadataMessageFormat = Json.format[UpdateImageUserMetadataMessage]
  implicit val deleteImageExportsMessageFormat = Json.format[DeleteImageExportsMessage]
  implicit val softDeleteImageMessageFormat = Json.format[SoftDeleteImageMessage]
  implicit val imageMessageFormat = Json.format[ImageMessage]
  implicit val updateImagePhotoshootMetadataMessage = Json.format[UpdateImagePhotoshootMetadataMessage]
  implicit val deleteUsagesMessage = Json.format[DeleteUsagesMessage]
  implicit val updateImageUsagesMessage = Json.format[UpdateImageUsagesMessage]
  implicit val addImageLeaseMessage = Json.format[AddImageLeaseMessage]
  implicit val removeImageLeaseMessage = Json.format[RemoveImageLeaseMessage]
  implicit val updateImageExportsMessage = Json.format[UpdateImageExportsMessage]

  implicit val createMigrationIndexMessage = Json.format[CreateMigrationIndexMessage]

  implicit val writes = Json.writes[ExternalThrallMessage]
  implicit val reads = Json.reads[ExternalThrallMessage]

}


case class ImageMessage(lastModified: DateTime, image: Image) extends ExternalThrallMessage {
  override def additionalMarkers: () => Map[String, Any] = ()=>
    Map("fileName" -> image.source.file.toString)

  override val id: String = image.id
}

case class DeleteImageMessage(id: String, lastModified: DateTime) extends ExternalThrallMessage

case class SoftDeleteImageMessage(id: String, lastModified: DateTime, softDeletedMetadata: SoftDeletedMetadata) extends ExternalThrallMessage

case class DeleteImageExportsMessage(id: String, lastModified: DateTime) extends ExternalThrallMessage

case class UpdateImageExportsMessage(id: String, lastModified: DateTime, crops: Seq[Crop]) extends ExternalThrallMessage

case class UpdateImageUserMetadataMessage(id: String, lastModified: DateTime, edits: Edits) extends ExternalThrallMessage

case class UpdateImageUsagesMessage(id: String, lastModified: DateTime, usageNotice: UsageNotice) extends ExternalThrallMessage

case class ReplaceImageLeasesMessage(id: String, lastModified: DateTime, leases: Seq[MediaLease]) extends ExternalThrallMessage

case class AddImageLeaseMessage(id: String, lastModified: DateTime, lease: MediaLease) extends ExternalThrallMessage

case class RemoveImageLeaseMessage(id: String, lastModified: DateTime, leaseId: String) extends ExternalThrallMessage

case class SetImageCollectionsMessage(id: String, lastModified: DateTime, collections: Seq[Collection]) extends ExternalThrallMessage

case class DeleteUsagesMessage(id: String, lastModified: DateTime) extends ExternalThrallMessage

object DeleteUsagesMessage {
  implicit val yourJodaDateReads = JodaReads.DefaultJodaDateTimeReads.map(d => d.withZone(DateTimeZone.UTC))
  implicit val yourJodaDateWrites = JodaWrites.JodaDateTimeWrites
  implicit val what = Json.format[DeleteUsagesMessage]
}

case class UpdateImageSyndicationMetadataMessage(id: String, lastModified: DateTime, maybeSyndicationRights: Option[SyndicationRights]) extends ExternalThrallMessage

case class UpdateImagePhotoshootMetadataMessage(id: String, lastModified: DateTime, edits: Edits) extends ExternalThrallMessage

/**
  * Message to start a new 'migration' (for re-index, re-ingestion etc.)
  * @param migrationStart timestamp representing when a migration commenced
  * @param gitHash the git commit hash (of the grid repo) at the point the migration commenced
  */
case class CreateMigrationIndexMessage(
  migrationStart: DateTime,
  gitHash: String
) extends ExternalThrallMessage {
  val id: String = "N/A"
  val lastModified: DateTime = migrationStart

  val newIndexName =
    s"images_${migrationStart.toString(DateTimeFormat.forPattern("yyyy-MM-dd_HH-mm-ss").withZoneUTC())}_${gitHash.take(7)}"
}
