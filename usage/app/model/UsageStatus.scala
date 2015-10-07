package model

import org.joda.time.DateTime


trait UsageStatus {
  override def toString = this match {
    case _:PendingUsageStatus => "pending"
    case _:PubishedUsageStatus => "published"
  }
}

case class PendingUsageStatus() extends UsageStatus
case class PubishedUsageStatus() extends UsageStatus
