package com.gu.mediaservice.model.usage

import com.gu.mediaservice.lib.logging.GridLogging
import org.joda.time.DateTime
case class UsageId(id: String) {
  override def toString = id
}

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
    if (mediaId.startsWith("gu-image-")) {
      // remove events from CAPI that represent images previous to Grid existing
      logger.info(s"MediaId $mediaId doesn't look like a Grid image. Ignoring usage $usageId.")
      false
    } else {
      true
    }
  }

  def isRemoved: Boolean = (for {
    added <- dateAdded
    removed <- dateRemoved
  } yield !removed.isBefore(added)).getOrElse(false)

  // Used in set comparison of UsageGroups
  override def equals(obj: Any): Boolean = obj match {
    case mediaUsage: MediaUsage => {
      usageId == mediaUsage.usageId &&
        grouping == mediaUsage.grouping &&
        dateRemoved.isEmpty
    } // TODO: This will work for checking if new items have been added/removed
    case _ => false
  }
}

