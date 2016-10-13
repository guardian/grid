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
    Logger.info(s"Usage update processed: $update")
    UsageMetrics.incrementUpdated

    update
  }

  val previewDbMatchStream = previewUsageStream.flatMap(matchDb)
  val liveDbMatchStream = liveUsageStream.flatMap(matchDb)

  case class MatchedUsageGroup(usageGroup: UsageGroup, dbUsageGroup: UsageGroup)
  case class MatchedUsageUpdate(updates: Seq[JsObject], matchUsageGroup: MatchedUsageGroup)

  def matchDb(usageGroup: UsageGroup) = UsageTable.matchUsageGroup(usageGroup)
    .retry((_, error) => {
      Logger.error(s"Encountered an error trying to match usage group (${usageGroup.grouping}", error)

      true
    })
    .map(MatchedUsageGroup(usageGroup, _))
    .map(matchedUsageGroup => {
      Logger.info(s"Built MatchedUsageGroup for ${usageGroup.grouping}")

      matchedUsageGroup
    })

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
      // Generate unique UUID to track extract job
      val uuid = java.util.UUID.randomUUID.toString

      val dbUsageGroup = matchUsageGroup.dbUsageGroup
      val usageGroup   = matchUsageGroup.usageGroup

      dbUsageGroup.usages.foreach(g => {
        Logger.info(s"Seen DB Usage for ${g.mediaId} (job-${uuid})")
      })
      usageGroup.usages.foreach(g => {
        Logger.info(s"Seen Stream Usage for ${g.mediaId} (job-${uuid})")
      })

      val deletes = (dbUsageGroup.usages -- usageGroup.usages).map(UsageTable.delete)
      val creates = (if(usageGroup.isReindex) { usageGroup.usages } else {(usageGroup.usages -- dbUsageGroup.usages)})
        .map(UsageTable.create)
      val updates = (if(usageGroup.isReindex) { Set() } else {usageGroup.usages & dbUsageGroup.usages})
        .map(UsageTable.update)

      Logger.info(s"DB Operations d(${deletes.size}), u(${updates.size}), c(${creates.size}) (job-${uuid})")

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
