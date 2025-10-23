package com.gu.mediaservice.model.usage

import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
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
  childUsageMetadata: Option[ChildUsageMetadata],
  lastModified: DateTime,
  dateAdded: Option[DateTime] = None,
  dateRemoved: Option[DateTime] = None
) extends GridLogging {

  def isGridLikeId(implicit logMarker: LogMarker): Boolean = {
    // _no_ids - CAPI may sometimes(?) insert this in an element missing an id
    if (mediaId == null || mediaId.trim.isEmpty || mediaId.trim == "_no_ids") {
      logger.warn(logMarker, s"Unprocessable MediaUsage, mediaId is empty ${this.toString}")
      false
    } else if (mediaId.startsWith("gu-image-") || mediaId.startsWith("gu-fc-")) {
      // remove events from CAPI that represent images previous to Grid existing
      logger.info(logMarker, s"MediaId $mediaId doesn't look like a Grid image. Ignoring usage $usageId.")
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

  private lazy val asEqualityTuple = (
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
    // NOTE that we don't compare any date fields
  )

  override def equals(other: Any): Boolean = other match {
    case otherUsage: MediaUsage => asEqualityTuple == otherUsage.asEqualityTuple
    case _ => false
  }

  override def hashCode(): Int = asEqualityTuple.##

}
