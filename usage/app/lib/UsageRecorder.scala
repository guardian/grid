package lib

import play.api.Logger

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration._

import scala.collection.JavaConversions._
import scala.collection.JavaConverters._

import play.api.libs.json._

import rx.lang.scala.{Observable, Subscriber}
import rx.lang.scala.subjects.PublishSubject

import model._

case class ResetException() extends Exception

object UsageRecorder {
  val usageSubject  = PublishSubject[UsageGroup]()
  val usageStream   = UsageStream.observable.merge(usageSubject)
  val resetInterval = 30.seconds

  val subscriber = Subscriber((_:Any) => Logger.debug(s"Sent Usage Notification"))
  def subscribe  = UsageRecorder.observable.subscribe(subscriber)

  // Due to a difficult to track down memory leak we 'reset' (unsubscribe/resubscribe)
  // This seems to make references in upstream observables available for GC
  val resetStreamObservable = Observable.interval(resetInterval).flatMap(_ => {
    Observable.error(new ResetException())
  })

  def recordUpdate(update: JsObject) = {
    Logger.debug(s"Usage update processed: $update")
    UsageMetrics.incrementUpdated

    update
  }

  val dbMatchStream = usageStream.flatMap(matchDb)

  case class MatchedUsageGroup(usageGroup: UsageGroup, dbUsageGroup: UsageGroup)
  case class MatchedUsageUpdate(updates: Seq[JsObject], matchUsageGroup: MatchedUsageGroup)

  def matchDb(usageGroup: UsageGroup) = UsageTable.matchUsageGroup(usageGroup)
    .map(MatchedUsageGroup(usageGroup, _))

  val dbUpdateStream = dbMatchStream.flatMap(matchUsageGroup => {
    val dbUsageGroup = matchUsageGroup.dbUsageGroup
    val usageGroup   = matchUsageGroup.usageGroup

    val deletes = (dbUsageGroup.usages -- usageGroup.usages).map(UsageTable.delete)
    val creates = (usageGroup.usages -- dbUsageGroup.usages).map(UsageTable.create)
    val updates = (usageGroup.usages & dbUsageGroup.usages).map(UsageTable.update)

    Observable.from(deletes ++ updates ++ creates).flatten[JsObject]
      .map(recordUpdate)
      .toSeq.map(MatchedUsageUpdate(_, matchUsageGroup))
  })

  val notificationStream = dbUpdateStream.flatMap(matchedUsageUpdates => {
    def buildNotifications(usages: Set[MediaUsage]) = Observable.from(
      usages.map(_.mediaId).toList.distinct.map(UsageNotice.build))

    val usageGroup = matchedUsageUpdates.matchUsageGroup.usageGroup
    val dbUsageGroup = matchedUsageUpdates.matchUsageGroup.dbUsageGroup

    buildNotifications(usageGroup.usages ++ dbUsageGroup.usages).flatten[UsageNotice]
  })

  val distinctNotificationStream = notificationStream.groupBy(_.mediaId).flatMap {
    case (_, s) => s.distinctUntilChanged
  }

  val notifiedStream = distinctNotificationStream.map(UsageNotifier.send)

  val rawObservable = notifiedStream.merge(resetStreamObservable)

  val observable = rawObservable.retry((_, error) => {
    error match {
      case _:ResetException => // Do nothing
      case _ => {
        Logger.error("UsageRecorder encountered an error.", error)
        UsageMetrics.incrementErrors
      }
    }

    true
  })
}
