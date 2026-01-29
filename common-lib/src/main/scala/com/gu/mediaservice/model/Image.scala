package com.gu.mediaservice.model

import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.model.leases.{AllowSyndicationLease, DenySyndicationLease, LeasesByMedia}
import com.gu.mediaservice.model.usage.{SyndicationUsage, Usage}
import org.joda.time.DateTime
import play.api.libs.json._

case class Image(
  id:                  String,
  uploadTime:          DateTime,
  uploadedBy:          String,
  softDeletedMetadata: Option[SoftDeletedMetadata],
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
  embedding:           Option[Embedding],
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
  implicit val ImageReads: Reads[Image] = Reads(value => {
    // this is why you avoid going over 22 items in a case class
    for {
      id <- (__ \ "id").read[String].reads(value)
      uploadTime <- (__ \ "uploadTime").read[String].map(unsafeParseDateTime).reads(value)
      uploadedBy <- (__ \ "uploadedBy").read[String].reads(value)
      softDeletedMetadata <- (__ \ "softDeletedMetadata").readNullable[SoftDeletedMetadata].reads(value)
      lastModified <- (__ \ "lastModified").readNullable[String].map(parseOptDateTime).reads(value)
      identifiers <- (__ \ "identifiers").readNullable[Map[String, String]].map(_ getOrElse Map()).reads(value)
      uploadInfo <- (__ \ "uploadInfo").readNullable[UploadInfo].map(_ getOrElse UploadInfo()).reads(value)
      source <- (__ \ "source").read[Asset].reads(value)
      thumbnail <- (__ \ "thumbnail").readNullable[Asset].reads(value)
      optimisedPng <- (__ \ "optimisedPng").readNullable[Asset].reads(value)
      fileMetadata <- (__ \ "fileMetadata").readNullable[FileMetadata].map(_ getOrElse FileMetadata()).reads(value)
      userMetadata <- (__ \ "userMetadata").readNullable[Edits].reads(value)
      metadata <- (__ \ "metadata").read[ImageMetadata].reads(value)
      originalMetadata <- (__ \ "originalMetadata").readNullable[ImageMetadata]
        .map(_ getOrElse ImageMetadata())
        .reads(value)
      usageRights <- (__ \ "usageRights").readNullable[UsageRights].map(_ getOrElse NoRights).reads(value)
      originalUsageRights <- (__ \ "originalUsageRights").readNullable[UsageRights].map(_ getOrElse NoRights).reads(value)
      exports <- (__ \ "exports").readNullable[List[Crop]].map(_ getOrElse List()).reads(value)
      usages <- (__ \ "usages").readNullable[List[Usage]].map(_ getOrElse List()).reads(value)
      leases <- (__ \ "leases").readNullable[LeasesByMedia].map(_ getOrElse LeasesByMedia.empty).reads(value)
      collections <- (__ \ "collections").readNullable[List[Collection]].map(_ getOrElse Nil).reads(value)
      syndicationRights <- (__ \ "syndicationRights").readNullable[SyndicationRights].reads(value)
      userMetadataLastModified <- (__ \ "userMetadataLastModified").readNullable[String].map(parseOptDateTime).reads(value)
      embedding <- (__ \ "embedding").readNullable[Embedding].reads(value)
    } yield Image(id = id,
      uploadTime = uploadTime,
      uploadedBy = uploadedBy,
      softDeletedMetadata = softDeletedMetadata,
      lastModified = lastModified,
      identifiers = identifiers,
      uploadInfo = uploadInfo,
      source = source,
      thumbnail = thumbnail,
      optimisedPng = optimisedPng,
      fileMetadata = fileMetadata,
      userMetadata = userMetadata,
      metadata = metadata,
      originalMetadata = originalMetadata,
      usageRights = usageRights,
      originalUsageRights = originalUsageRights,
      exports = exports,
      usages = usages,
      leases = leases,
      collections = collections,
      syndicationRights = syndicationRights,
      embedding = embedding,
      userMetadataLastModified = userMetadataLastModified)
  })

  implicit val ImageWrites: Writes[Image] = {
    def writes[T](v: T)(implicit writer: Writes[T]): JsValue =
      writer writes v
    Writes { image =>
      JsObject(Map(
        "id" -> writes(image.id),
        "uploadTime" -> writes(printDateTime(image.uploadTime)),
        "uploadedBy" -> writes(image.uploadedBy),
        "softDeletedMetadata" -> writes(image.softDeletedMetadata),
        "lastModified" -> writes(printOptDateTime(image.lastModified)),
        "identifiers" -> writes(image.identifiers),
        "uploadInfo" -> writes(image.uploadInfo),
        "source" -> writes(image.source),
        "thumbnail" -> writes(image.thumbnail),
        "optimisedPng" -> writes(image.optimisedPng),
        "fileMetadata" -> writes(image.fileMetadata),
        "userMetadata" -> writes(image.userMetadata),
        "metadata" -> writes(image.metadata),
        "originalMetadata" -> writes(image.originalMetadata),
        "usageRights" -> writes(image.usageRights),
        "originalUsageRights" -> writes(image.originalUsageRights),
        "exports" -> writes(image.exports),
        "usages" -> writes(image.usages),
        "leases" -> writes(image.leases),
        "collections" -> writes(image.collections),
        "syndicationRights" -> writes(image.syndicationRights),
        "userMetadataLastModified" -> writes(printOptDateTime(image.userMetadataLastModified)),
      ))
    }
  }
}

