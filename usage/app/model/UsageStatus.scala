package model

import org.joda.time.DateTime


trait UsageStatus {
  val timestamp: DateTime

  override def toString = this match {
    case _:PendingUsageStatus => "pending"
    case _:PubishedUsageStatus => "published"
  }
}

case class PendingUsageStatus(timestamp: DateTime) extends UsageStatus
case class PubishedUsageStatus(timestamp: DateTime) extends UsageStatus
