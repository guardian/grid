package model

import com.amazonaws.services.dynamodbv2.document.Item
import com.gu.contentapi.client.model.v1.{Content, Element}
import com.gu.mediaservice.model.DateFormat
import org.joda.time.DateTime
import play.api.libs.json._

import scala.util.Try
import scala.collection.JavaConversions._
import scala.collection.JavaConverters._

import play.api.libs.json._
import play.api.libs.functional.syntax._
import java.net.URI


case class MediaUsage(
  usageId: UsageId,
  grouping: String,
  mediaId: String,
  usageType: String,
  mediaType: String,
  status: UsageStatus,
  data: Map[String, String],
  lastModified: DateTime,
  dateAdded: Option[DateTime] = None,
  dateRemoved: Option[DateTime] = None
) {
  // Used in set comparison of UsageGroups
  override def equals(obj: Any): Boolean = obj match {
    case mediaUsage: MediaUsage => {
      usageId == mediaUsage.usageId &&
      grouping == mediaUsage.grouping
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
      Option(item.getMap[String]("data_map"))
        .getOrElse(new java.util.HashMap[String, String]()).toMap,
      new DateTime(item.getLong("last_modified")),
      Try { item.getLong("date_added") }.toOption.map(new DateTime(_)),
      Try { item.getLong("date_removed") }.toOption.map(new DateTime(_))
    )

  def build(elementWrapper: ElementWrapper, contentWrapper: ContentWrapper) = {
    val usageId = UsageId.build(elementWrapper, contentWrapper)
    val contentDetails = ContentDetails.build(contentWrapper.content)

    MediaUsage(
      usageId,
      contentWrapper.id,
      elementWrapper.media.id,
      "web",
      elementWrapper.media.`type`.toString,
      contentWrapper.status,
      contentDetails.toMap,
      contentWrapper.lastModified
    )
  }

  def build(printUsage: PrintUsageRecord, usageId: UsageId) = MediaUsage(
    usageId,
    usageId.toString,
    printUsage.mediaId,
    "print",
    "Image",
    printUsage.usageStatus,
    printUsage.printUsageDetails.toMap,
    printUsage.dateAdded
  )
}
