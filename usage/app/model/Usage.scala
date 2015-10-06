package model

import com.gu.contentapi.client.model.v1.Element
import org.joda.time.DateTime
import lib.MD5


trait UsageStatus {
  val timestamp: DateTime

  override def toString = this match {
    case _:PendingUsageStatus => "pending"
    case _:PubishedUsageStatus => "published"
  }
}

case class PendingUsageStatus(timestamp: DateTime) extends UsageStatus
case class PubishedUsageStatus(timestamp: DateTime) extends UsageStatus

case class MediaUsage(
  usageId: String,
  grouping: String,
  element: Element
) {
  override def equals(obj: Any): Boolean = obj match {
    case mediaUsage: MediaUsage => {
      usageId == mediaUsage.usageId &&
      grouping == mediaUsage.grouping &&
      element.id == mediaUsage.element.id
    }
    case _ => false
  }

}

object MediaUsage {
  def build(media: Element, status: UsageStatus, index: Int, grouping: String) =
    MediaUsage(createUsageId(media, status, index), grouping, media)

  def createUsageId(media: Element, status: UsageStatus, index: Int) =
    MD5.hash(s"${media.id}_${index}_${status}")
}

case class UsageGroup(
  usages: Set[MediaUsage],
  grouping: String,
  status: UsageStatus
)
