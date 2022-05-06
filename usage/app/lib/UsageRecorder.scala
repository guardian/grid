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

  def matchDb(usageGroup: UsageGroup): Observable[MatchedUsageGroup] = usageTable.matchUsageGroup(usageGroup)
    .retry((retriesSoFar, error) => {
      logger.error(s"Encountered an error trying to match usage group (${usageGroup.grouping}", error)

      true // TODO check 'retriesSoFar' so we don't retry forever 🙀
    })
    .map{dbUsages =>
      logger.info(s"Built MatchedUsageGroup for ${usageGroup.grouping}")
      MatchedUsageGroup(usageGroup, dbUsages)
    }

  val dbUpdateStream: Observable[Set[String]] = getUpdatesStream(dbMatchStream)

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

  private def getUpdatesStream(dbMatchStream:  Observable[MatchedUsageGroup]): Observable[Set[String]] = {
    dbMatchStream.flatMap(matchedUsageGroup => {
      // Generate unique UUID to track extract job
      val logMarker = MarkerMap(
        "job-uuid" -> java.util.UUID.randomUUID.toString
      )

      val usageGroup = matchedUsageGroup.usageGroup
      val dbUsages = usageGroup.maybeStatus.fold(
        matchedUsageGroup.dbUsages
      )(
        status => matchedUsageGroup.dbUsages.filter(dbUsage => dbUsage.status == status && !dbUsage.isRemoved)
      )
      val dbUsageMap = dbUsages.map(_.entry).toMap
      val dbUsageKeys = dbUsageMap.keySet

      val streamUsageMap = usageGroup.usages.map(_.entry).toMap
      val streamUsageKeys = streamUsageMap.keySet

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
          s"'$opName' DB Operation for ${mediaUsage.grouping} - on mediaID: ${mediaUsage.mediaId} with result: $result"
        )
        usageMetrics.incrementUpdated
        result
      }

      // FIXME exponential number of DB operations likely related to the content status (derived from preview vs live stream)

      val toMarkAsRemoved = (dbUsageKeys diff streamUsageKeys).flatMap(dbUsageMap.get)
      val markAsRemovedOps = toMarkAsRemoved
        .map(performAndLogDBOperation(usageTable.markAsRemoved, "markAsRemoved"))

      val toCreate = (if(usageGroup.isReindex) streamUsageKeys else streamUsageKeys diff dbUsageKeys)
        .flatMap(streamUsageMap.get)
      val createOps = toCreate.map(performAndLogDBOperation(usageTable.create, "create"))

      // TODO add a filter to only bother with these updates when there are meaningful changes to the DB record (possibly via the .equals method)
      val toUpdate = (if (usageGroup.isReindex) Set() else streamUsageKeys intersect dbUsageKeys)
        .flatMap(streamUsageMap.get)
      val updateOps = toUpdate.map(performAndLogDBOperation(usageTable.update, "update"))

      val mediaIdsImplicatedInDBUpdates =
        (usageGroup.usages ++ dbUsages)
          .filter(_.isGridLikeId)
          .map(_.mediaId)

      Observable.from(markAsRemovedOps ++ updateOps ++ createOps)
        .flatten[JsObject]
        .map(_ => mediaIdsImplicatedInDBUpdates)
    })
  }

  private def getNotificationStream(dbUpdateStream: Observable[Set[String]]) = {
    dbUpdateStream
      .delay(5.seconds) // give DynamoDB write a greater chance of reaching eventual consistency, before reading
      .flatMap{ mediaIdsImplicatedInDBUpdates =>
        Observable.from(
          mediaIdsImplicatedInDBUpdates
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
