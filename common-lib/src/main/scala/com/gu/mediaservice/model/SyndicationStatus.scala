package com.gu.mediaservice.model

import play.api.libs.json._

sealed trait SyndicationStatus {
  override def toString: String = this match {
    case SentForSyndication => "sent"
    case QueuedForSyndication => "queued"
    case BlockedForSyndication => "blocked"
    case AwaitingReviewForSyndication => "review"
    case UnsuitableForSyndication => "unsuitable"
  }
}

object SyndicationStatus {
  def apply(status: String): SyndicationStatus = status.toLowerCase match {
    case "sent" => SentForSyndication
    case "queued" => QueuedForSyndication
    case "blocked" => BlockedForSyndication
    case "review" => AwaitingReviewForSyndication
    case "unsuitable" => UnsuitableForSyndication
  }

  implicit val reads: Reads[SyndicationStatus] = JsPath.read[String].map(SyndicationStatus(_))

  implicit val writer = new Writes[SyndicationStatus] {
    def writes(status: SyndicationStatus) = JsString(status.toString)
  }
}

object SentForSyndication extends SyndicationStatus
object QueuedForSyndication extends SyndicationStatus
object BlockedForSyndication extends SyndicationStatus
object AwaitingReviewForSyndication extends SyndicationStatus
object UnsuitableForSyndication extends SyndicationStatus
