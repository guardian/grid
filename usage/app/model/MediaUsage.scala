package model

import com.amazonaws.services.dynamodbv2.document.Item
import com.gu.crier.model.event.v1.EventPayload.Content
import com.gu.mediaservice.model.{PrintUsageMetadata, DigitalUsageMetadata, DateFormat}
import com.gu.mediaservice.model.{PendingUsageStatus, PublishedUsageStatus, PrintUsageRecord, UsageStatus}
import org.joda.time.DateTime
import play.api.libs.json._

import scala.util.Try
import scala.collection.JavaConversions._
import scala.collection.JavaConverters._

import play.api.libs.json._
import play.api.libs.functional.syntax._
import java.net.URI

import lib.UsageMetadataBuilder


case class MediaUsage(
  usageId: UsageId,
  grouping: String,
  mediaId: String,
  usageType: String,
  mediaType: String,
  status: UsageStatus,
  printUsageMetadata: Option[PrintUsageMetadata],
  digitalUsageMetadata: Option[DigitalUsageMetadata],
  lastModified: DateTime,
  dateAdded: Option[DateTime] = None,
  dateRemoved: Option[DateTime] = None
) {
  def isRemoved = (for {
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

object MediaUsage {

  def build(item: Item) =
    MediaUsage(
      UsageId(item.getString("usage_id")),
      item.getString("grouping"),
      item.getString("media_id"),
      item.getString("usage_type"),
      item.getString("media_type"),
      item.getString("usage_status") match {
        case "pending" => PendingUsageStatus()
        case "published" => PublishedUsageStatus()
      },
      Option(item.getMap[Any]("print_metadata"))
        .map(_.asScala.toMap).flatMap(UsageMetadataBuilder.buildPrint),
      Option(item.getMap[Any]("digital_metadata"))
        .map(_.asScala.toMap).flatMap(UsageMetadataBuilder.buildDigital),
      new DateTime(item.getLong("last_modified")),
      Try { item.getLong("date_added") }.toOption.map(new DateTime(_)),
      Try { item.getLong("date_removed") }.toOption.map(new DateTime(_))
    )

  def build(elementWrapper: ElementWrapper, contentWrapper: ContentWrapper) = {
    val usageId = UsageId.build(elementWrapper, contentWrapper)
    val usageMetadata = UsageMetadataBuilder.build(contentWrapper.content.content)

    MediaUsage(
      usageId,
      UsageGroup.buildId(contentWrapper),
      elementWrapper.media.id,
      "digital",
      "image",
      contentWrapper.status,
      None,
      Some(usageMetadata),
      contentWrapper.lastModified
    )
  }

  def build(printUsage: PrintUsageRecord, usageId: UsageId) = MediaUsage(
    usageId,
    UsageGroup.buildId(printUsage),
    printUsage.mediaId,
    "print",
    "image",
    printUsage.usageStatus,
    Some(printUsage.printUsageMetadata),
    None,
    printUsage.dateAdded
  )
}
