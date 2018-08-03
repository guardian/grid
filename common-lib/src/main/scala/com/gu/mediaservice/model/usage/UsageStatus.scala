package com.gu.mediaservice.model.usage

import play.api.libs.json._

sealed trait UsageStatus {
  override def toString = this match {
    case PendingUsageStatus => "pending"
    case PublishedUsageStatus => "published"
    case RemovedUsageStatus => "removed"
  }
}

object UsageStatus {
  def apply(status: String): UsageStatus = status.toLowerCase match {
    case "pending" => PendingUsageStatus
    case "published" => PublishedUsageStatus
    case "removed" => RemovedUsageStatus
  }

  implicit val reads: Reads[UsageStatus] = JsPath.read[String].map(UsageStatus(_))

  implicit val writer = new Writes[UsageStatus] {
    def writes(usageStatus: UsageStatus) = JsString(usageStatus.toString)
  }
}

object PendingUsageStatus extends UsageStatus
object PublishedUsageStatus extends UsageStatus
object RemovedUsageStatus extends UsageStatus
