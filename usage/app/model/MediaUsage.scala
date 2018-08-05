package model

import com.amazonaws.services.dynamodbv2.document.Item
import com.gu.mediaservice.model.usage._
import lib.UsageMetadataBuilder
import org.joda.time.DateTime

import scala.collection.JavaConverters._
import scala.util.Try

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
  lastModified: DateTime,
  dateAdded: Option[DateTime] = None,
  dateRemoved: Option[DateTime] = None
) {
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

class MediaUsageOps(usageMetadataBuilder: UsageMetadataBuilder) {

  def build(item: Item) =
    MediaUsage(
      UsageId(item.getString("usage_id")),
      item.getString("grouping"),
      item.getString("media_id"),
      UsageType(item.getString("usage_type")),
      item.getString("media_type"),
      UsageStatus(item.getString("usage_status")),
      Option(item.getMap[Any]("print_metadata"))
        .map(_.asScala.toMap).flatMap(usageMetadataBuilder.buildPrint),
      Option(item.getMap[Any]("digital_metadata"))
        .map(_.asScala.toMap).flatMap(usageMetadataBuilder.buildDigital),
      Option(item.getMap[Any]("syndication_metadata"))
        .map(_.asScala.toMap).flatMap(usageMetadataBuilder.buildSyndication),
      new DateTime(item.getLong("last_modified")),
      Try { item.getLong("date_added") }.toOption.map(new DateTime(_)),
      Try { item.getLong("date_removed") }.toOption.map(new DateTime(_))
    )

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
    printUsage.dateAdded
  )

  def build(mediaWrapper: MediaWrapper): MediaUsage = {
    val usageId = UsageId.build(mediaWrapper)

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
      lastModified = mediaWrapper.lastModified
    )
  }

  def build(syndicationUsageRequest: SyndicationUsageRequest, groupId: String): MediaUsage = {
    val usageId = UsageId.build(syndicationUsageRequest)
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
      lastModified = syndicationUsageRequest.dateAdded
    )
  }
}
