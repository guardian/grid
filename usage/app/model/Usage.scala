package model

import com.gu.contentapi.client.model.v1.Element
import org.joda.time.DateTime


trait UsageStatus {
  val timestamp: DateTime
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

case class UsageGroup(
  usages: Set[MediaUsage],
  grouping: String,
  status: UsageStatus
)
