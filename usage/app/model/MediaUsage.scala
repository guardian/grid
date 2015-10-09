package model

import com.amazonaws.services.dynamodbv2.document.Item
import com.gu.contentapi.client.model.v1.{Content, Element}
import org.joda.time.DateTime
import play.api.libs.json._

import scala.collection.JavaConversions._
import scala.collection.JavaConverters._


case class MediaUsage(
  usageId: String,
  grouping: String,
  mediaId: String,
  usageType: String,
  mediaType: String,
  status: UsageStatus,
  data: Map[String, String],
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
        case "published" => PublishedUsageStatus()
      },
      Option(item.getMap[String]("data_map"))
        .getOrElse(new java.util.HashMap[String, String]()).toMap,
      new DateTime(item.getLong("last_modified"))
    )

  def build(elementWrapper: ElementWrapper, contentWrapper: ContentWrapper) = {
    val usageId = UsageId.build(elementWrapper, contentWrapper)
    val contentDetails = ContentDetails.build(contentWrapper.content)

    MediaUsage(
      usageId.toString,
      contentWrapper.id,
      elementWrapper.media.id,
      "web",
      elementWrapper.media.`type`.toString,
      contentWrapper.status,
      contentDetails.toMap,
      contentWrapper.lastModified
    )
  }

}
