package lib

import com.gu.mediaservice.model.usage._
import model._


object MediaUsageBuilder {

  def build(printUsage: PrintUsageRecord, usageId: UsageId, grouping: String) = MediaUsage(
    usageId,
    grouping,
    printUsage.mediaId,
    PrintUsage,
    "image",
    printUsage.usageStatus,
    Some(printUsage.printUsageMetadata),
    None,
    None,
    None,
    None,
    printUsage.dateAdded
  )

  def build(mediaWrapper: MediaWrapper): MediaUsage = {
    val usageId = UsageIdBuilder.build(mediaWrapper)

    MediaUsage(
      usageId = usageId,
      grouping = mediaWrapper.usageGroupId,
      mediaId = mediaWrapper.mediaId,
      DigitalUsage,
      mediaType = "image",
      status = mediaWrapper.contentStatus,
      printUsageMetadata = None,
      digitalUsageMetadata = Some(mediaWrapper.usageMetadata),
      None,
      None,
      None,
      lastModified = mediaWrapper.lastModified
    )
  }

  def build(syndicationUsageRequest: SyndicationUsageRequest, groupId: String): MediaUsage = {
    val usageId = UsageIdBuilder.build(syndicationUsageRequest)
    MediaUsage(
      usageId,
      groupId,
      syndicationUsageRequest.mediaId,
      SyndicationUsage,
      mediaType = "image",
      syndicationUsageRequest.status,
      printUsageMetadata = None,
      digitalUsageMetadata = None,
      syndicationUsageMetadata = Some(syndicationUsageRequest.metadata),
      None,
      None,
      lastModified = syndicationUsageRequest.dateAdded
    )
  }

  def build(frontUsageRequest: FrontUsageRequest, groupId: String): MediaUsage = {
    val usageId = UsageIdBuilder.build(frontUsageRequest)

    MediaUsage(
      usageId,
      groupId,
      frontUsageRequest.mediaId,
      DigitalUsage,
      mediaType = "image",
      frontUsageRequest.status,
      printUsageMetadata = None,
      digitalUsageMetadata = None,
      syndicationUsageMetadata = None,
      frontUsageMetadata = Some(frontUsageRequest.metadata),
      None,
      lastModified = frontUsageRequest.dateAdded
    )
  }

  def build(downloadUsageRequest: DownloadUsageRequest, groupId: String): MediaUsage = {
    val usageId = UsageIdBuilder.build(downloadUsageRequest)

    MediaUsage (
      usageId,
      groupId,
      downloadUsageRequest.mediaId,
      DownloadUsage,
      mediaType = "image",
      downloadUsageRequest.status,
      printUsageMetadata = None,
      digitalUsageMetadata = None,
      syndicationUsageMetadata = None,
      frontUsageMetadata = None,
      downloadUsageMetadata = Some(downloadUsageRequest.metadata),
      lastModified = downloadUsageRequest.dateAdded
    )
  }
}
