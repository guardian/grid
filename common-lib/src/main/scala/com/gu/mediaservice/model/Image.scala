package com.gu.mediaservice.model

import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.model.leases.{AllowSyndicationLease, DenySyndicationLease, LeasesByMedia}
import com.gu.mediaservice.model.usage.{SyndicationUsage, Usage}
import org.joda.time.DateTime
import play.api.libs.functional.syntax._
import play.api.libs.json._


case class Image(
  id:                  String,
  uploadTime:          DateTime,
  uploadedBy:          String,
  lastModified:        Option[DateTime],
  identifiers:         Map[String, String],
  uploadInfo:          UploadInfo,
  source:              Asset,
  thumbnail:           Option[Asset],
  optimisedPng:        Option[Asset],
  fileMetadata:        FileMetadata,
  userMetadata:        Option[Edits],
  metadata:            ImageMetadata,
  originalMetadata:    ImageMetadata,
  usageRights:         UsageRights,
  originalUsageRights: UsageRights,
  exports:             List[Crop]       = Nil,
  usages:              List[Usage]      = Nil,
  leases:              LeasesByMedia    = LeasesByMedia.empty,
  collections:         List[Collection] = Nil,
  syndicationRights:   Option[SyndicationRights] = None,
  userMetadataLastModified: Option[DateTime] = None) extends LogMarker {

  def hasExports = exports.nonEmpty

  def hasUsages = usages.nonEmpty

  def canBeDeleted = !hasExports && !hasUsages

  def rcsPublishDate: Option[DateTime] = syndicationRights.flatMap(_.published)

  def hasInferredSyndicationRightsOrNoRights: Boolean = syndicationRights.forall(_.isInferred)

  def hasNonInferredRights: Boolean = !hasInferredSyndicationRightsOrNoRights

  def syndicationStatus: SyndicationStatus = {
    val isRightsAcquired: Boolean = syndicationRights.exists(_.isRightsAcquired)

    if (!isRightsAcquired) {
      UnsuitableForSyndication
    } else {
      val hasSyndicationUsage = usages.exists(_.platform == SyndicationUsage)

      if (hasSyndicationUsage) {
        SentForSyndication
      } else {
        val allowSyndicationLease = leases.leases.find(_.access == AllowSyndicationLease)
        val denySyndicationLease = leases.leases.find(_.access == DenySyndicationLease)

        (allowSyndicationLease, denySyndicationLease) match {
          case (Some(_), None) => QueuedForSyndication
          case (None, Some(_)) => BlockedForSyndication
          case (_, _) => AwaitingReviewForSyndication
        }
      }
    }
  }

  override def markerContents: Map[String, Any] = Map(
    "imageId" -> id,
    "mimeType" -> source.mimeType.getOrElse(FALLBACK)
  )
}

object Image {

  import com.gu.mediaservice.lib.formatting._

  // FIXME: many fields made nullable to accommodate for legacy data that pre-dates them.
  // We should migrate the data for better consistency so nullable can be retired.
  implicit val ImageReads: Reads[Image] = (
    (__ \ "id").read[String] ~
      (__ \ "uploadTime").read[String].map(unsafeParseDateTime) ~
      (__ \ "uploadedBy").read[String] ~
      (__ \ "lastModified").readNullable[String].map(parseOptDateTime) ~
      (__ \ "identifiers").readNullable[Map[String, String]].map(_ getOrElse Map()) ~
      (__ \ "uploadInfo").readNullable[UploadInfo].map(_ getOrElse UploadInfo()) ~
      (__ \ "source").read[Asset] ~
      (__ \ "thumbnail").readNullable[Asset] ~
      (__ \ "optimisedPng").readNullable[Asset] ~
      (__ \ "fileMetadata").readNullable[FileMetadata].map(_ getOrElse FileMetadata()) ~
      (__ \ "userMetadata").readNullable[Edits] ~
      (__ \ "metadata").read[ImageMetadata] ~
      (__ \ "originalMetadata").readNullable[ImageMetadata].map(_ getOrElse ImageMetadata()) ~
      (__ \ "usageRights").readNullable[UsageRights].map(_ getOrElse NoRights) ~
      (__ \ "originalUsageRights").readNullable[UsageRights].map(_ getOrElse NoRights) ~
      (__ \ "exports").readNullable[List[Crop]].map(_ getOrElse List()) ~
      (__ \ "usages").readNullable[List[Usage]].map(_ getOrElse List()) ~
      (__ \ "leases").readNullable[LeasesByMedia].map(_ getOrElse LeasesByMedia.empty) ~
      (__ \ "collections").readNullable[List[Collection]].map(_ getOrElse Nil) ~
      (__ \ "syndicationRights").readNullable[SyndicationRights] ~
      (__ \ "userMetadataLastModified").readNullable[String].map(parseOptDateTime)
    )(Image.apply _)

  implicit val ImageWrites: Writes[Image] = (
    (__ \ "id").write[String] ~
      (__ \ "uploadTime").write[String].contramap(printDateTime) ~
      (__ \ "uploadedBy").write[String] ~
      (__ \ "lastModified").writeNullable[String].contramap(printOptDateTime) ~
      (__ \ "identifiers").write[Map[String, String]] ~
      (__ \ "uploadInfo").write[UploadInfo] ~
      (__ \ "source").write[Asset] ~
      (__ \ "thumbnail").writeNullable[Asset] ~
      (__ \ "optimisedPng").writeNullable[Asset] ~
      (__ \ "fileMetadata").write[FileMetadata] ~
      (__ \ "userMetadata").writeNullable[Edits] ~
      (__ \ "metadata").write[ImageMetadata] ~
      (__ \ "originalMetadata").write[ImageMetadata] ~
      (__ \ "usageRights").write[UsageRights] ~
      (__ \ "originalUsageRights").write[UsageRights] ~
      (__ \ "exports").write[List[Crop]] ~
      (__ \ "usages").write[List[Usage]] ~
      (__ \ "leases").write[LeasesByMedia] ~
      (__ \ "collections").write[List[Collection]] ~
      (__ \ "syndicationRights").writeNullable[SyndicationRights] ~
      (__ \ "userMetadataLastModified").writeNullable[String].contramap(printOptDateTime)
    )(unlift(Image.unapply))

}

