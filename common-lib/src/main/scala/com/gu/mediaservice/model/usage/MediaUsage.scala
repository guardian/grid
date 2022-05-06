package com.gu.mediaservice.model.usage

import com.gu.mediaservice.lib.logging.GridLogging
import org.joda.time.DateTime
case class UsageId(id: String) {
  override def toString = id
}

case class MediaUsageKey(
  usageId: UsageId,
  grouping: String,
)
case class MediaUsage(
  usageId: UsageId,
  grouping: String,
  mediaId: String,
  usageType: UsageType,
  mediaType: String,
  status: UsageStatus,
  printUsageMetadata: Option[PrintUsageMetadata],
  digitalUsageMetadata: Option[DigitalUsageMetadata],
  syndicationUsageMetadata: Option[SyndicationUsageMetadata],
  frontUsageMetadata: Option[FrontUsageMetadata],
  downloadUsageMetadata: Option[DownloadUsageMetadata],
  lastModified: DateTime,
  dateAdded: Option[DateTime] = None,
  dateRemoved: Option[DateTime] = None
) extends GridLogging {

  def isGridLikeId: Boolean = {
    if (mediaId.startsWith("gu-image-") || mediaId.startsWith("gu-fc-")) {
      // remove events from CAPI that represent images previous to Grid existing
      logger.info(s"MediaId $mediaId doesn't look like a Grid image. Ignoring usage $usageId.")
      false
    } else if (mediaId.trim.isEmpty) {
      logger.warn("Unprocessable MediaUsage, mediaId is empty", this)
      false
    } else {
      true
    }
  }

  def isRemoved: Boolean = (for {
    added <- dateAdded
    removed <- dateRemoved
  } yield !removed.isBefore(added)).getOrElse(false)

  def key: MediaUsageKey = MediaUsageKey(usageId = usageId, grouping = grouping)
  def entry: (MediaUsageKey, MediaUsage) = key -> this

  override def equals(other: Any): Boolean = other match {
    case otherUsage: MediaUsage =>
      usageId == otherUsage.usageId &&
      grouping == otherUsage.grouping &&
      mediaId == otherUsage.mediaId &&
      usageType == otherUsage.usageType &&
      mediaType == otherUsage.mediaType &&
      status == otherUsage.status &&
      printUsageMetadata == otherUsage.printUsageMetadata &&
      digitalUsageMetadata == otherUsage.digitalUsageMetadata &&
      syndicationUsageMetadata == otherUsage.syndicationUsageMetadata &&
      frontUsageMetadata == otherUsage.frontUsageMetadata &&
      downloadUsageMetadata == otherUsage.downloadUsageMetadata
      // NOTE that we don't compare any date fields
    case _ => false
  }

  override def hashCode(): Int = List(
    usageId,
    grouping,
    mediaId,
    usageType,
    mediaType,
    status,
    printUsageMetadata,
    digitalUsageMetadata,
    syndicationUsageMetadata,
    frontUsageMetadata,
    downloadUsageMetadata
  ).mkString("_").hashCode
}
