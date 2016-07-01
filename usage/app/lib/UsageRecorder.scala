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
  val liveUsageStream = UsageStream.liveObservable.merge(usageSubject)
  val previewUsageStream = UsageStream.previewObservable.merge(usageSubject)

  val subscriber = Subscriber((_:Any) => Logger.debug(s"Sent Usage Notification"))
  def subscribeToLive  = UsageRecorder.liveObservable.subscribe(subscriber)
  def subscribeToPreview  = UsageRecorder.previewObservable.subscribe(subscriber)

  def recordUpdate(update: JsObject) = {
    Logger.debug(s"Usage update processed: $update")
    UsageMetrics.incrementUpdated

    update
  }

  val dbMatchLiveStream: Observable[MatchedUsageGroup] = liveUsageStream.flatMap(matchDb)
  val dbMatchPreviewStream = previewUsageStream.flatMap(matchDb)

  case class MatchedUsageGroup(usageGroup: UsageGroup, dbUsageGroup: UsageGroup)
  case class MatchedUsageUpdate(updates: Seq[JsObject], matchUsageGroup: MatchedUsageGroup)

  private def matchDb(usageGroup: UsageGroup) = UsageTable.matchUsageGroup(usageGroup)
    .map(MatchedUsageGroup(usageGroup, _))

  private def getUpdateStream(dbMatchStream: Observable[MatchedUsageGroup]) = {
    dbMatchStream.flatMap(matchUsageGroup => {
      println("now getting update stream!!!")
      val dbUsageGroup = matchUsageGroup.dbUsageGroup
      val usageGroup = matchUsageGroup.usageGroup

      val deletes = (dbUsageGroup.usages -- usageGroup.usages).map(UsageTable.delete)
      val creates = (usageGroup.usages -- dbUsageGroup.usages).map(UsageTable.create)
      val updates = (usageGroup.usages & dbUsageGroup.usages).map(UsageTable.update)

      Observable.from(deletes ++ updates ++ creates).flatten[JsObject]
        .map(recordUpdate)
        .toSeq.map(MatchedUsageUpdate(_, matchUsageGroup))
    })
  }

  val dbLiveUpdateStream: Observable[MatchedUsageUpdate] = getUpdateStream(dbMatchLiveStream)
  val dbPreviewUpdateStream = getUpdateStream(dbMatchPreviewStream)

  def getNotificationStream(dbUpdateStream: Observable[MatchedUsageUpdate]) = {
    dbUpdateStream.flatMap(matchedUsageUpdates => {
      println("** usage update **", matchedUsageUpdates)

      def buildNotifications(usages: Set[MediaUsage]) = {

        println("!! now building a notification!!")
        Observable.from(
          usages.map(_.mediaId).toList.distinct.map(UsageNotice.build))
      }

      val usageGroup = matchedUsageUpdates.matchUsageGroup.usageGroup
      val dbUsageGroup = matchedUsageUpdates.matchUsageGroup.dbUsageGroup

      buildNotifications(usageGroup.usages ++ dbUsageGroup.usages).flatten[UsageNotice]
    })
  }

  val liveNotificationStream = getNotificationStream(dbLiveUpdateStream)
  val previewNotificationStream = getNotificationStream(dbPreviewUpdateStream)

  val distinctLiveNotificationStream = liveNotificationStream.groupBy(_.mediaId).flatMap {
    case (_, s) => {
      println("distinct live stream")
      s.distinctUntilChanged
    }
  }

  val distinctPreviewNotificationStream = liveNotificationStream.groupBy(_.mediaId).flatMap {
    case (_, s) => {
      println("distinct preview stream")
      s.distinctUntilChanged
    }
  }

  val liveNotifiedStream = {
    println("live notified stream")
    distinctLiveNotificationStream.map(not => {
      println("now notification is ", not)
      UsageNotifier.send(not)
    })
  }
  val previewNotifiedStream = {
    println("print notified stream")
    distinctPreviewNotificationStream.map(not => {
      println("not now it ", not)
      UsageNotifier.send(not)
    })
  }

  val liveObservable = liveNotifiedStream.retry((_, error) => {
    Logger.error("UsageRecorder encountered an error.", error)
    UsageMetrics.incrementErrors

    true
  }).tumbling(30.second)

  val previewObservable = liveNotifiedStream.retry((_, error) => {
    Logger.error("UsageRecorder encountered an error.", error)
    UsageMetrics.incrementErrors

    true
  }).tumbling(30.second)
}
