package model

import com.amazonaws.services.dynamodbv2.document.Item
import com.gu.contentapi.client.model.v1.Element
import org.joda.time.DateTime
import play.api.libs.json._

import lib.MD5


case class MediaUsage(
  usageId: String,
  grouping: String,
  mediaId: String,
  usageType: String,
  mediaType: String,
  status: UsageStatus,
  lastModified: DateTime
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
  implicit val jsonWrites: Writes[MediaUsage] = Json.writes[MediaUsage]

  def build(item: Item) =
    MediaUsage(
      item.getString("usage_id"),
      item.getString("grouping"),
      item.getString("media_id"),
      item.getString("usage_type"),
      item.getString("media_type"),
      item.getString("usage_status") match {
        case "pending" => PendingUsageStatus()
        case "published" => PubishedUsageStatus()
      },
      new DateTime(item.getLong("last_modified"))
    )

  def build(media: Element, status: UsageStatus, index: Int, grouping: String, lastModified: DateTime) =
    MediaUsage(
      createUsageId(media.id, status, index),
      grouping,
      media.id,
      "web",
      "image",
      status,
      lastModified
    )

  // The purpose of this hash is to obfuscate the usage_id
  def createUsageId(mediaId: String, status: UsageStatus, index: Int) =
    MD5.hash(s"${mediaId}_${index}_${status}")

}
