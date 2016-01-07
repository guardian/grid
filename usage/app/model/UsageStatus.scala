package model

import org.joda.time.DateTime
import play.api.libs.json._

trait UsageStatus {
  override def toString = this match {
    case _:PendingUsageStatus => "pending"
    case _:PublishedUsageStatus => "published"
  }
}

object UsageStatus {
  implicit val reads: Reads[UsageStatus] = JsPath.read[String].map {
    case "pending" => PendingUsageStatus()
    case "published" => PublishedUsageStatus()
  }

  implicit val writer = new Writes[UsageStatus] {
    def writes(usageStatus: UsageStatus): JsValue = {
      Json.obj("usageStatus" -> usageStatus.toString)
    }
  }
}

case class PendingUsageStatus() extends UsageStatus
case class PublishedUsageStatus() extends UsageStatus
