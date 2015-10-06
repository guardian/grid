package model

import com.amazonaws.services.dynamodbv2.document.Item
import com.gu.contentapi.client.model.v1.Element
import org.joda.time.DateTime

import lib.MD5


case class MediaUsage(
  usageId: String,
  grouping: String,
  usageDetails: UsageDetails
) {
  // Used when we want to check if an existing object has been modified
  def ===(obj: Any): Boolean = obj match {
    case mediaUsage: MediaUsage => {
      usageId == mediaUsage.usageId &&
      grouping == mediaUsage.grouping &&
      usageDetails == mediaUsage.usageDetails
    }
    case _ => false
  }

  // Used in set comparison of UsageGroups
  override def equals(obj: Any): Boolean = obj match {
    case mediaUsage: MediaUsage => {
      usageId == mediaUsage.usageId &&
      grouping == mediaUsage.grouping &&
      usageDetails.id == mediaUsage.usageDetails.id
    } // TODO: This will work for checking if new items have been added and
      // removed but NOT if existing records have been updated (underlying image data)
      // can we override === to check?
    case _ => false
  }
}

object MediaUsage {
  def build(item: Item) =
    MediaUsage(
      item.getString("usage_id"),
      item.getString("grouping"),
      UsageDetails(
        item.getString("media_id"),
        item.getString("usage_type"),
        item.getString("media_type"),
        item.getString("usage_status") match {
          case "pending" => PendingUsageStatus(new DateTime())
          case "published" => PubishedUsageStatus(new DateTime())
        }
      )
    )

  def build(media: Element, status: UsageStatus, index: Int, grouping: String) =
    MediaUsage(
      createUsageId(media.id, status, index),
      grouping,
      UsageDetails.build(media,status)
    )

  // The purpose of this hash is to obfuscate the usage_id
  def createUsageId(mediaId: String, status: UsageStatus, index: Int) =
    MD5.hash(s"${mediaId}_${index}_${status}")
}

case class UsageDetails(
  id: String,
  usageType: String,
  mediaType: String,
  status: UsageStatus
)

object UsageDetails {
  def build(element: Element, status: UsageStatus) =
    UsageDetails(element.id, "web", "image", status)
}
