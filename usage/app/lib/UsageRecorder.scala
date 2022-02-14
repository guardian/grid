package lib

import com.gu.mediaservice.lib.logging.{GridLogging, MarkerMap}
import com.gu.mediaservice.model.usage.{MediaUsage, UsageNotice}
import model._
import play.api.libs.json._
import rx.lang.scala.subjects.PublishSubject
import rx.lang.scala.{Observable, Subject, Subscriber, Subscription}

import scala.concurrent.duration.DurationInt

case class ResetException() extends Exception

class UsageRecorder(
  usageMetrics: UsageMetrics,
  usageTable: UsageTable,
  usageNotice: UsageNotifier,
  usageNotifier: UsageNotifier
) extends GridLogging {

  val usageApiSubject: Subject[UsageGroup] = PublishSubject[UsageGroup]()
  val combinedObservable: Observable[UsageGroup] = CrierUsageStream.observable.merge(usageApiSubject)

  val subscriber: Subscriber[Unit] = Subscriber((_: Unit) => logger.debug(s"Sent Usage Notification"))
  var maybeSubscription: Option[Subscription] = None

  val dbMatchStream: Observable[MatchedUsageGroup] = combinedObservable.flatMap(matchDb)

  case class MatchedUsageGroup(usageGroup: UsageGroup, dbUsages: Set[MediaUsage])
  case class MatchedUsageUpdate(updates: Seq[JsObject], matchUsageGroup: MatchedUsageGroup)

  def matchDb(usageGroup: UsageGroup): Observable[MatchedUsageGroup] = usageTable.matchUsageGroup(usageGroup)
    .retry((retriesSoFar, error) => {
      logger.error(s"Encountered an error trying to match usage group (${usageGroup.grouping}", error)

      true // TODO check 'retriesSoFar' so we don't retry forever 🙀
    })
    .map{dbUsages =>
      logger.info(s"Built MatchedUsageGroup for ${usageGroup.grouping}")
      MatchedUsageGroup(usageGroup, dbUsages)
    }

  val dbUpdateStream: Observable[MatchedUsageUpdate] = getUpdatesStream(dbMatchStream)

  val notificationStream: Observable[UsageNotice] = getNotificationStream(dbUpdateStream)

  val distinctNotificationStream: Observable[UsageNotice] = notificationStream.groupBy(_.mediaId).flatMap {
    case (_, s) => s.distinctUntilChanged
  }

  val notifiedStream: Observable[Unit] = distinctNotificationStream.map(usageNotifier.send)

  val finalObservable: Observable[Unit] = notifiedStream.retry((_, error) => {
    logger.error("UsageRecorder encountered an error.", error)
    usageMetrics.incrementErrors

    true
  })

  private def getUpdatesStream(dbMatchStream:  Observable[MatchedUsageGroup]) = {
    dbMatchStream.flatMap(matchedUsageGroup => {
      // Generate unique UUID to track extract job
      val logMarker = MarkerMap(
        "job-uuid" -> java.util.UUID.randomUUID.toString
      )

      val dbUsages = matchedUsageGroup.dbUsages
      val usageGroup   = matchedUsageGroup.usageGroup

      dbUsages.foreach(mediaUsage => {
        logger.info(logMarker, s"Seen DB Usage for ${mediaUsage.mediaId}")
      })
      usageGroup.usages.foreach(mediaUsage => {
        logger.info(logMarker, s"Seen Stream Usage for ${mediaUsage.mediaId}")
      })

      def performAndLogDBOperation(func: MediaUsage => Observable[JsObject], opName: String)(mediaUsage: MediaUsage) = {
        val result = func(mediaUsage)
        logger.info(
          logMarker,
          s"'$opName' DB Operation for ${mediaUsage.grouping} -  on mediaID: ${mediaUsage.mediaId} with result: ${result}"
        )
        result
      }

      val markAsRemovedOps = (dbUsages diff usageGroup.usages)
        .map(performAndLogDBOperation(usageTable.markAsRemoved, "markAsRemoved"))

      val createOps = (if(usageGroup.isReindex) usageGroup.usages else usageGroup.usages diff dbUsages)
        .map(performAndLogDBOperation(usageTable.create, "create"))

      val updateOps = (if(usageGroup.isReindex) Set() else usageGroup.usages intersect dbUsages)
        .map(performAndLogDBOperation(usageTable.update, "update"))

      Observable.from(markAsRemovedOps ++ updateOps ++ createOps).flatten[JsObject].toSeq
        .map{updates =>
          usageMetrics.incrementUpdated
          MatchedUsageUpdate(updates, matchedUsageGroup)
        }
    })
  }

  private def getNotificationStream(dbUpdateStream: Observable[MatchedUsageUpdate]) = {

    dbUpdateStream
      .delay(5.seconds) // give DynamoDB write a greater chance of reaching eventual consistency, before reading
      .flatMap{ matchedUsageUpdates =>

        val usageGroup = matchedUsageUpdates.matchUsageGroup.usageGroup
        val dbUsages = matchedUsageUpdates.matchUsageGroup.dbUsages

        val usages: Set[MediaUsage] = usageGroup.usages ++ dbUsages

        Observable.from(
          usages
            .filter(_.isGridLikeId)
            .map(usageNotice.build)
        ).flatten[UsageNotice]
      }
  }

  def start(): Unit = {
    // Eval subscription to start stream
    maybeSubscription = Some(finalObservable.subscribe(subscriber))
  }

  def stop(): Unit = {
    maybeSubscription.foreach(_.unsubscribe())
  }

}
