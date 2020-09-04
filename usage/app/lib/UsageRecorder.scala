package lib

import com.gu.mediaservice.model.usage.{MediaUsage, UsageNotice}
import model._
import play.api.Logger
import play.api.libs.json._
import rx.lang.scala.subjects.PublishSubject
import rx.lang.scala.{Observable, Subscriber, Subscription}

case class ResetException() extends Exception

class UsageRecorder(usageMetrics: UsageMetrics, usageTable: UsageTable, usageStream: UsageStream, usageNotice: UsageNotifier, usageNotifier: UsageNotifier) {
  val usageSubject = PublishSubject[UsageGroup]()
  val previewUsageStream: Observable[UsageGroup] = usageStream.previewObservable.merge(usageSubject)
  val liveUsageStream: Observable[UsageGroup] = usageStream.liveObservable.merge(usageSubject)

  val subscriber = Subscriber((_:Any) => Logger.debug(s"Sent Usage Notification"))

  var subscribeToPreview: Option[Subscription] = None
  var subscribeToLive: Option[Subscription] = None

  def recordUpdate(update: JsObject): JsObject = {
    Logger.info(s"Usage update processed: $update")
    usageMetrics.incrementUpdated

    update
  }

  val previewDbMatchStream: Observable[MatchedUsageGroup] = previewUsageStream.flatMap(matchDb)
  val liveDbMatchStream: Observable[MatchedUsageGroup] = liveUsageStream.flatMap(matchDb)

  case class MatchedUsageGroup(usageGroup: UsageGroup, dbUsageGroup: UsageGroup)
  case class MatchedUsageUpdate(updates: Seq[JsObject], matchUsageGroup: MatchedUsageGroup)

  def start(): Unit = {
    // Eval subscription to start stream
    subscribeToPreview = Some(previewObservable.subscribe(subscriber))
    subscribeToLive = Some(liveObservable.subscribe(subscriber))
  }

  def stop(): Unit = {
    subscribeToPreview.foreach(_.unsubscribe())
    subscribeToLive.foreach(_.unsubscribe())
  }

  def matchDb(usageGroup: UsageGroup): Observable[MatchedUsageGroup] = usageTable.matchUsageGroup(usageGroup)
    .retry((_, error) => {
      Logger.error(s"Encountered an error trying to match usage group (${usageGroup.grouping}", error)

      true
    })
    .map(MatchedUsageGroup(usageGroup, _))
    .map(matchedUsageGroup => {
      Logger.info(s"Built MatchedUsageGroup for ${usageGroup.grouping}")

      matchedUsageGroup
    })

  val previewDbUpdateStream: Observable[MatchedUsageUpdate] = getUpdatesStream(previewDbMatchStream)
  val liveDbUpdateStream: Observable[MatchedUsageUpdate] = getUpdatesStream(liveDbMatchStream)

  val previewNotificationStream: Observable[UsageNotice] = getNotificationStream(previewDbUpdateStream)
  val liveNotificationStream: Observable[UsageNotice] = getNotificationStream(liveDbUpdateStream)

  val distinctPreviewNotificationStream: Observable[UsageNotice] = previewNotificationStream.groupBy(_.mediaId).flatMap {
    case (_, s) => s.distinctUntilChanged
  }

  val distinctLiveNotificationStream: Observable[UsageNotice] = liveNotificationStream.groupBy(_.mediaId).flatMap {
    case (_, s) => s.distinctUntilChanged
  }

  val previewNotifiedStream: Observable[Unit] = distinctPreviewNotificationStream.map(usageNotifier.send)
  val liveNotifiedStream: Observable[Unit] = distinctLiveNotificationStream.map(usageNotifier.send)

  def reportStreamError(i: Int, error: Throwable): Boolean = {
    Logger.error("UsageRecorder encountered an error.", error)
    usageMetrics.incrementErrors

    true
  }

  val previewObservable: Observable[Unit] = previewNotifiedStream.retry((i, e) => reportStreamError(i,e))
  val liveObservable: Observable[Unit] = liveNotifiedStream.retry((i, e) => reportStreamError(i,e))

  private def getUpdatesStream(dbMatchStream:  Observable[MatchedUsageGroup]) = {
    dbMatchStream.flatMap(matchUsageGroup => {
      // Generate unique UUID to track extract job
      val uuid = java.util.UUID.randomUUID.toString

      val dbUsageGroup = matchUsageGroup.dbUsageGroup
      val usageGroup   = matchUsageGroup.usageGroup

      dbUsageGroup.usages.foreach(g => {
        Logger.info(s"Seen DB Usage for ${g.mediaId} (job-$uuid)")
      })
      usageGroup.usages.foreach(g => {
        Logger.info(s"Seen Stream Usage for ${g.mediaId} (job-$uuid)")
      })

      val deletes = (dbUsageGroup.usages -- usageGroup.usages).map(usageTable.delete)
      val creates = (if(usageGroup.isReindex) usageGroup.usages else usageGroup.usages -- dbUsageGroup.usages)
        .map(usageTable.create)
      val updates = (if(usageGroup.isReindex) Set() else usageGroup.usages & dbUsageGroup.usages)
        .map(usageTable.update)

      Logger.info(s"DB Operations d(${deletes.size}), u(${updates.size}), c(${creates.size}) (job-$uuid)")

      Observable.from(deletes ++ updates ++ creates).flatten[JsObject]
        .map(recordUpdate)
        .toSeq.map(MatchedUsageUpdate(_, matchUsageGroup))
    })
  }

  private def getNotificationStream(dbUpdateStream: Observable[MatchedUsageUpdate]) = {
    dbUpdateStream.flatMap(matchedUsageUpdates => {
      def buildNotifications(usages: Set[MediaUsage]) = Observable.from(
        usages
          .filter(_.isGridLikeId)
          .map(_.mediaId)
          .toList.distinct.map(usageNotice.build))

      val usageGroup = matchedUsageUpdates.matchUsageGroup.usageGroup
      val dbUsageGroup = matchedUsageUpdates.matchUsageGroup.dbUsageGroup

      buildNotifications(usageGroup.usages ++ dbUsageGroup.usages).flatten[UsageNotice]
    })
  }

}
