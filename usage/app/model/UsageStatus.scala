package model

import org.joda.time.DateTime
import play.api.libs.json._

trait UsageStatus {
  override def toString = this match {
    case _:PendingUsageStatus => "pending"
    case _:PubishedUsageStatus => "published"
  }
}

object UsageStatus {
  implicit val writer = new Writes[UsageStatus] {
    def writes(usageStatus: UsageStatus): JsValue = {
      Json.obj("usageStatus" -> usageStatus.toString)
    }
  }
}

case class PendingUsageStatus() extends UsageStatus
case class PubishedUsageStatus() extends UsageStatus
