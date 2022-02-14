package lib

import com.gu.mediaservice.model.usage.{MediaUsage, UsageNotice}
import com.typesafe.scalalogging.StrictLogging
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
) extends StrictLogging {

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
      val uuid = java.util.UUID.randomUUID.toString

      val dbUsages = matchedUsageGroup.dbUsages
      val usageGroup   = matchedUsageGroup.usageGroup

      dbUsages.foreach(g => {
        logger.info(s"Seen DB Usage for ${g.mediaId} (job-$uuid)")
      })
      usageGroup.usages.foreach(g => {
        logger.info(s"Seen Stream Usage for ${g.mediaId} (job-$uuid)")
      })

      val deletes = (dbUsages -- usageGroup.usages).map(usageTable.delete)
      val creates = (if(usageGroup.isReindex) usageGroup.usages else usageGroup.usages -- dbUsages)
        .map(usageTable.create)
      val updates = (if(usageGroup.isReindex) Set() else usageGroup.usages & dbUsages)
        .map(usageTable.update)

      logger.info(s"DB Operations for ${usageGroup.grouping} d(${deletes.size}), u(${updates.size}), c(${creates.size}) (job-$uuid)")

      Observable.from(deletes ++ updates ++ creates).flatten[JsObject]
        .map{update =>
          logger.info(s"Usage update processed: $update")
          usageMetrics.incrementUpdated

          update
        }
        .toSeq.map(MatchedUsageUpdate(_, matchedUsageGroup))
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
