package lib

import play.api.Logger

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._

import play.api.libs.json._

import _root_.rx.lang.scala.{Observable, Subscriber}
import _root_.rx.lang.scala.subjects.PublishSubject

import model._

case class ResetException() extends Exception

object UsageRecorder {
  val usageSubject  = PublishSubject[UsageGroup]()
  val previewUsageStream = UsageStream.previewObservable.merge(usageSubject)
  val liveUsageStream = UsageStream.liveObservable.merge(usageSubject)

  val subscriber = Subscriber((_:Any) => Logger.debug(s"Sent Usage Notification"))
  def subscribeToPreview  = UsageRecorder.previewObservable.subscribe(subscriber)
  def subscribeToLive  = UsageRecorder.liveObservable.subscribe(subscriber)

  def recordUpdate(update: JsObject) = {
    Logger.debug(s"Usage update processed: $update")
    UsageMetrics.incrementUpdated

    update
  }

  val previewDbMatchStream = previewUsageStream.flatMap(matchDb)
  val liveDbMatchStream = liveUsageStream.flatMap(matchDb)

  case class MatchedUsageGroup(usageGroup: UsageGroup, dbUsageGroup: UsageGroup)
  case class MatchedUsageUpdate(updates: Seq[JsObject], matchUsageGroup: MatchedUsageGroup)

  def matchDb(usageGroup: UsageGroup) = UsageTable.matchUsageGroup(usageGroup)
    .map(MatchedUsageGroup(usageGroup, _))


  val previewDbUpdateStream = getUpdatesStream(previewDbMatchStream)
  val liveDbUpdateStream = getUpdatesStream(liveDbMatchStream)

  val previewNotificationStream = getNotificationStream(previewDbUpdateStream)
  val liveNotificationStream = getNotificationStream(liveDbUpdateStream)

  val distinctPreviewNotificationStream = previewNotificationStream.groupBy(_.mediaId).flatMap {
    case (_, s) => s.distinctUntilChanged
  }

  val distinctLiveNotificationStream = liveNotificationStream.groupBy(_.mediaId).flatMap {
    case (_, s) => s.distinctUntilChanged
  }

  val previewNotifiedStream = distinctPreviewNotificationStream.map(UsageNotifier.send)
  val liveNotifiedStream = distinctLiveNotificationStream.map(UsageNotifier.send)

  val previewObservable = previewNotifiedStream.retry((_, error) => {
    Logger.error("UsageRecorder encountered an error.", error)
    UsageMetrics.incrementErrors

    true
  }).tumbling(30.second)

  val liveObservable = liveNotifiedStream.retry((_, error) => {
    Logger.error("UsageRecorder encountered an error.", error)
    UsageMetrics.incrementErrors

    true
  }).tumbling(30.second)

  private def getUpdatesStream(dbMatchStream:  Observable[MatchedUsageGroup]) = {
    dbMatchStream.flatMap(matchUsageGroup => {
      val dbUsageGroup = matchUsageGroup.dbUsageGroup
      val usageGroup   = matchUsageGroup.usageGroup

      val deletes = (dbUsageGroup.usages -- usageGroup.usages).map(UsageTable.delete)
      val creates = (usageGroup.usages -- dbUsageGroup.usages).map(UsageTable.create)
      val updates = (usageGroup.usages & dbUsageGroup.usages).map(UsageTable.update)

      Observable.from(deletes ++ updates ++ creates).flatten[JsObject]
        .map(recordUpdate)
        .toSeq.map(MatchedUsageUpdate(_, matchUsageGroup))
    })
  }

  private def getNotificationStream(dbUpdateStream: Observable[MatchedUsageUpdate]) = {
    dbUpdateStream.flatMap(matchedUsageUpdates => {
      def buildNotifications(usages: Set[MediaUsage]) = Observable.from(
        usages.map(_.mediaId).toList.distinct.map(UsageNotice.build))

      val usageGroup = matchedUsageUpdates.matchUsageGroup.usageGroup
      val dbUsageGroup = matchedUsageUpdates.matchUsageGroup.dbUsageGroup

      buildNotifications(usageGroup.usages ++ dbUsageGroup.usages).flatten[UsageNotice]
    })
  }

}
