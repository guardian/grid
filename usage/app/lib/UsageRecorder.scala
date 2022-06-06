package lib

import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap}
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

  val usageApiSubject: Subject[WithContext[UsageGroup]] = PublishSubject[WithContext[UsageGroup]]()
  val combinedObservable: Observable[WithContext[UsageGroup]] = CrierUsageStream.observable.merge(usageApiSubject)

  val subscriber: Subscriber[LogMarker] = Subscriber((markers: LogMarker) => logger.debug(markers, s"Sent Usage Notification"))
  var maybeSubscription: Option[Subscription] = None

  val dbMatchStream: Observable[WithContext[MatchedUsageGroup]] = combinedObservable.flatMap(matchDb)

  case class MatchedUsageGroup(usageGroup: UsageGroup, dbUsages: Set[MediaUsage])

  def matchDb(usageGroupWithContext: WithContext[UsageGroup]): Observable[WithContext[MatchedUsageGroup]] = {
    val WithContext(context, usageGroup) = usageGroupWithContext
    usageTable.matchUsageGroup(usageGroupWithContext)
      .retry((retriesSoFar, error) => {
        val maxRetries = 5
        logger.error(
          context ++ Map("retry" -> retriesSoFar),
          s"Encountered an error trying to match usage group (${usageGroup.grouping}) retry $retriesSoFar of $maxRetries",
          error
        )

        retriesSoFar < maxRetries
      })
      .map{dbUsagesWithContext =>
        implicit val logMarker: LogMarker = dbUsagesWithContext.context
        logger.info(dbUsagesWithContext.context, s"Built MatchedUsageGroup for ${usageGroup.grouping}")
        WithContext(MatchedUsageGroup(usageGroup, dbUsagesWithContext.value))
      }
  }

  val dbUpdateStream: Observable[WithContext[Set[String]]] = getUpdatesStream(dbMatchStream)

  val notificationStream: Observable[WithContext[UsageNotice]] = getNotificationStream(dbUpdateStream)

  val distinctNotificationStream: Observable[WithContext[UsageNotice]] = notificationStream.groupBy(_.value.mediaId).flatMap {
    case (_, s) => s.distinctUntilChanged
  }

  val notifiedStream: Observable[LogMarker] = distinctNotificationStream.map(usageNotifier.send)

  val finalObservable: Observable[LogMarker] = notifiedStream.retry((retriesSoFar, error) => {
    val maxRetries = 5
    logger.error(MarkerMap("retry" -> retriesSoFar), "UsageRecorder encountered an error.", error)
    usageMetrics.incrementErrors

    retriesSoFar < maxRetries
  })

  private def getUpdatesStream(dbMatchStream:  Observable[WithContext[MatchedUsageGroup]]): Observable[WithContext[Set[String]]] = {
    dbMatchStream.flatMap(matchedUsageGroupWithContext => {
      implicit val logMarker: LogMarker = matchedUsageGroupWithContext.context
      val matchedUsageGroup = matchedUsageGroupWithContext.value

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
        val resultObservable = func(mediaUsage)
        resultObservable.foreach(result => {
          logger.info(
            logMarker,
            s"'$opName' DB Operation for ${mediaUsage.grouping} - on mediaID: ${mediaUsage.mediaId} with result: $result"
          )
          usageMetrics.incrementUpdated
        })
        resultObservable
      }

      val markAsRemovedOps = dbUsageKeys.diff(streamUsageKeys)
        .flatMap(dbUsageMap.get)
        .map(performAndLogDBOperation(usageTable.markAsRemoved, "markAsRemoved"))

      val createOps = (if(usageGroup.isReindex) streamUsageKeys else streamUsageKeys.diff(dbUsageKeys))
          .flatMap(streamUsageMap.get)
          .map(performAndLogDBOperation(usageTable.create, "create"))

      val updateOps = (if (usageGroup.isReindex) Set() else streamUsageKeys.intersect(dbUsageKeys))
        .flatMap(streamUsageMap.get)
        .diff(dbUsages) // to avoid updating to the same data that's already in the DB
        .map(performAndLogDBOperation(usageTable.update, "update"))

      val mediaIdsImplicatedInDBUpdates =
        (usageGroup.usages ++ dbUsages)
          .filter(_.isGridLikeId)
          .map(_.mediaId)

      Observable.from(markAsRemovedOps ++ updateOps ++ createOps)
        .flatten[JsObject]
        .map(_ => WithContext(mediaIdsImplicatedInDBUpdates))
    })
  }

  private def getNotificationStream(dbUpdateStream: Observable[WithContext[Set[String]]]): Observable[WithContext[UsageNotice]] = {
    dbUpdateStream
      .delay(5.seconds) // give DynamoDB write a greater chance of reaching eventual consistency, before reading
      .flatMap{ mediaIdsImplicatedInDBUpdatesWithContext =>
        implicit val logMarker: LogMarker = mediaIdsImplicatedInDBUpdatesWithContext.context
        Observable.from(mediaIdsImplicatedInDBUpdatesWithContext.value.map(usageNotice.build)).flatten[UsageNotice].map(WithContext(_))
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
