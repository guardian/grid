package com.gu.mediaservice.model.usage

import play.api.libs.json._

sealed trait UsageStatus {
  override def toString = this match {
    case PendingUsageStatus => "pending"
    case PublishedUsageStatus => "published"
    case RemovedUsageStatus => "removed"
    case SyndicatedUsageStatus => "syndicated"
    case DownloadedUsageStatus => "downloaded"
    case FastlyUsageStatus => "fastly"
    case UnknownUsageStatus => "unknown"
  }
}

object UsageStatus {
  def apply(status: String): UsageStatus = status.toLowerCase match {
    case "pending" => PendingUsageStatus
    case "published" => PublishedUsageStatus
    case "removed" => RemovedUsageStatus
    case "syndicated" => SyndicatedUsageStatus
    case "downloaded" => DownloadedUsageStatus
    case "fastly" => FastlyUsageStatus
    case "unknown" => UnknownUsageStatus
  }

  implicit val reads: Reads[UsageStatus] = JsPath.read[String].map(UsageStatus(_))

  implicit val writer = new Writes[UsageStatus] {
    def writes(usageStatus: UsageStatus) = JsString(usageStatus.toString)
  }
}

object PendingUsageStatus extends UsageStatus
object PublishedUsageStatus extends UsageStatus
object RemovedUsageStatus extends UsageStatus
object SyndicatedUsageStatus extends UsageStatus
object DownloadedUsageStatus extends UsageStatus
object FastlyUsageStatus extends UsageStatus

// For Fronts usages as we don't know if a front is in draft or is live
// TODO remove this once we do!
object UnknownUsageStatus extends UsageStatus
