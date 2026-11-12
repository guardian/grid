package lib

import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap}
import com.gu.mediaservice.model.usage.{MediaUsage, UsageNotice}
import model._
import org.apache.pekko.Done
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{Keep, Sink}
import play.api.libs.json._
import rx.lang.scala.subjects.PublishSubject
import rx.lang.scala.{Observable, Subject, Subscription}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{Future, Promise}
import scala.concurrent.duration.{DurationInt, FiniteDuration}

case class ResetException() extends Exception

class UsageRecorder(
  usageMetrics: UsageMetrics,
  usageTable: UsageTable,
  usageNotice: UsageNotifier,
  usageNotifier: UsageNotifier,
  usageGroupStream: UsageGroupStream,
  notificationDelay: FiniteDuration = 5.seconds
)(implicit materializer: Materializer) extends GridLogging {

  private val usageGroupSubject: Subject[WithLogMarker[UsageGroup]] = PublishSubject[WithLogMarker[UsageGroup]]()
  val combinedObservable: Observable[WithLogMarker[UsageGroup]] = usageGroupSubject

  var maybeSubscription: Option[Subscription] = None
  private var maybeIngressCompletion: Option[Future[Done]] = None
  private val processingCompletion = Promise[Done]()

  val dbMatchStream: Observable[WithLogMarker[MatchedUsageGroup]] = combinedObservable.flatMap(matchDb)

  case class MatchedUsageGroup(usageGroup: UsageGroup, dbUsages: Set[MediaUsage])

  def matchDb(usageGroupWithContext: WithLogMarker[UsageGroup]): Observable[WithLogMarker[MatchedUsageGroup]] = {
    val WithLogMarker(logMarker, usageGroup) = usageGroupWithContext
    Observable.defer(Observable.from(usageTable.matchUsageGroup(usageGroupWithContext)))
      .retry((retriesSoFar, error) => {
        val maxRetries = 5
        logger.error(
          logMarker ++ Map("retry" -> retriesSoFar),
          s"Encountered an error trying to match usage group (${usageGroup.grouping}) retry $retriesSoFar of $maxRetries",
          error
        )

        retriesSoFar < maxRetries
      })
      .map{dbUsagesWithContext =>
        implicit val logMarker: LogMarker = dbUsagesWithContext.logMarker
        logger.info(dbUsagesWithContext.logMarker, s"Built MatchedUsageGroup for ${usageGroup.grouping}")
        WithLogMarker(MatchedUsageGroup(usageGroup, dbUsagesWithContext.value))
      }
  }

  val dbUpdateStream: Observable[WithLogMarker[Set[String]]] = getUpdatesStream(dbMatchStream)

  val notificationStream: Observable[WithLogMarker[UsageNotice]] = getNotificationStream(dbUpdateStream)

  val notifiedStream: Observable[LogMarker] = notificationStream.map(usageNotifier.send)

  val finalObservable: Observable[LogMarker] = notifiedStream.retry((retriesSoFar, error) => {
    val maxRetries = 5
    logger.error(MarkerMap("retry" -> retriesSoFar), "UsageRecorder encountered an error.", error)
    usageMetrics.incrementErrors

    retriesSoFar < maxRetries
  })

  private def getUpdatesStream(dbMatchStream:  Observable[WithLogMarker[MatchedUsageGroup]]): Observable[WithLogMarker[Set[String]]] = {
    dbMatchStream.flatMap(matchedUsageGroupWithContext => {
      implicit val logMarker: LogMarker = matchedUsageGroupWithContext.logMarker
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

      def performAndLogDBOperation(func: MediaUsage => Future[JsObject], opName: String)(mediaUsage: MediaUsage) = {
        val resultObservable = Observable.from(func(mediaUsage))
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
        .toSeq // observable emits exactly once, when all ops complete and have been emitted, or immediately if there are 0 ops
        .map(_ => {
          logger.info(logMarker, s"Emitting ${mediaIdsImplicatedInDBUpdates.size} media IDs for notification")
          WithLogMarker(mediaIdsImplicatedInDBUpdates)
        })
    })
  }

  private def getNotificationStream(dbUpdateStream: Observable[WithLogMarker[Set[String]]]): Observable[WithLogMarker[UsageNotice]] = {
    dbUpdateStream
      .delay(notificationDelay) // give DynamoDB write a greater chance of reaching eventual consistency, before reading
      .flatMap{ mediaIdsImplicatedInDBUpdatesWithContext =>
        implicit val logMarker: LogMarker = mediaIdsImplicatedInDBUpdatesWithContext.logMarker
        logger.info(logMarker, s"Building ${mediaIdsImplicatedInDBUpdatesWithContext.value.size} usage notices")
        Observable.from(mediaIdsImplicatedInDBUpdatesWithContext.value.map(id =>
          Observable.defer(Observable.from(usageNotice.build(id)))
        ))
          .flatten[UsageNotice]
          .map(WithLogMarker(_))
      }
  }

  def start(): Unit = {
    maybeSubscription = Some(finalObservable.subscribe(
      markers => logger.debug(markers, "Sent Usage Notification"),
      error => processingCompletion.tryFailure(error),
      () => processingCompletion.trySuccess(Done)
    ))
    val (queue, ingressCompletion) = usageGroupStream.source
      .toMat(Sink.foreach(usageGroupSubject.onNext))(Keep.both)
      .run()
    usageGroupStream.attachQueue(queue)
    maybeIngressCompletion = Some(ingressCompletion)
  }

  def stop(): Future[Done] = {
    maybeIngressCompletion match {
      case None => usageGroupStream.complete()
      case Some(ingressCompletion) =>
        usageGroupStream.complete()
          .flatMap(_ => ingressCompletion)
          .map(_ => usageGroupSubject.onCompleted())
          .flatMap(_ => processingCompletion.future)
          .andThen { case _ => maybeSubscription.foreach(_.unsubscribe()) }
    }
  }

}
