package lib

import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap}
import com.gu.mediaservice.model.usage.MediaUsage
import model._
import org.apache.pekko.Done
import org.apache.pekko.actor.Scheduler
import org.apache.pekko.pattern.after
import org.apache.pekko.stream.{Attributes, DelayOverflowStrategy, Materializer}
import org.apache.pekko.stream.scaladsl.{Flow, Keep, Sink}
import play.api.libs.json.JsObject

import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, ExecutionContextExecutorService, Future}
import scala.concurrent.duration._
import scala.util.{Failure, Success, Try}

class UsageRecorder(
  usageMetrics: UsageMetrics,
  usageTable: UsageTable,
  usageNotifier: UsageNotifier,
  usageGroupStream: UsageGroupStream,
  scheduler: Scheduler,
  notificationDelay: FiniteDuration = 5.seconds
)(implicit materializer: Materializer, executionContext: ExecutionContext) extends GridLogging {

  private case class MatchedUsageGroup(logMarker: LogMarker, usageGroup: UsageGroup, dbUsages: Set[MediaUsage])
  private case class PendingNotifications(logMarker: LogMarker, mediaIds: Set[String])

  private val notificationExecutionContext: ExecutionContextExecutorService =
    ExecutionContext.fromExecutorService(Executors.newFixedThreadPool(4))

  private var maybeCompletion: Option[Future[Done]] = None
  private var maybeStop: Option[Future[Done]] = None

  def start(): Unit = {
    if (maybeCompletion.isEmpty) {
      val (queue, completion) = usageGroupStream.source
        .mapAsync(8)(matchAndUpdate)
        .mapConcat(_.toList)
        .via(
          Flow[PendingNotifications]
            .delay(notificationDelay, DelayOverflowStrategy.backpressure)
            .withAttributes(Attributes.inputBuffer(initial = 128, max = 128))
        )
        .mapAsync(8)(notifyPending)
        .mapConcat(_.toList)
        .toMat(Sink.foreach(markers => logger.debug(markers, "Sent Usage Notification")))(Keep.both)
        .run()

      usageGroupStream.attachQueue(queue)
      maybeCompletion = Some(completion)
    }
  }

  def stop(): Future[Done] = synchronized {
    maybeStop.getOrElse {
      val stopped = maybeCompletion match {
        case Some(completion) => usageGroupStream.complete().flatMap(_ => completion)
        case None => Future.successful(Done)
      }
      val result = stopped.andThen { case _ => notificationExecutionContext.shutdown() }
      maybeStop = Some(result)
      result
    }
  }

  private def matchAndUpdate(usageGroupWithContext: WithLogMarker[UsageGroup]): Future[Option[PendingNotifications]] = {
    val WithLogMarker(logMarker, usageGroup) = usageGroupWithContext

    matchDb(usageGroupWithContext)
      .flatMap(getUpdates)
      .map { mediaIds =>
        Option.when(mediaIds.nonEmpty)(PendingNotifications(logMarker, mediaIds))
      }
      .recover { case error =>
        logger.error(logMarker ++ Map("usageGroup" -> usageGroup.grouping), "UsageRecorder encountered an error.", error)
        usageMetrics.incrementErrors
        None
      }
  }

  private def matchDb(usageGroupWithContext: WithLogMarker[UsageGroup]): Future[MatchedUsageGroup] = {
    val WithLogMarker(logMarker, usageGroup) = usageGroupWithContext

    retrying(usageTable.matchUsageGroup(usageGroupWithContext), maxAttempts = 5) { (attempt, error) =>
      logger.error(
        logMarker ++ Map("retry" -> attempt),
        s"Encountered an error trying to match usage group (${usageGroup.grouping}) retry $attempt of 5",
        error
      )
      usageMetrics.incrementErrors
    }.map { dbUsagesWithContext =>
      logger.info(dbUsagesWithContext.logMarker, s"Built MatchedUsageGroup for ${usageGroup.grouping}")
      MatchedUsageGroup(dbUsagesWithContext.logMarker, usageGroup, dbUsagesWithContext.value)
    }
  }

  private def getUpdates(matchedUsageGroup: MatchedUsageGroup): Future[Set[String]] = {
    implicit val logMarker: LogMarker = matchedUsageGroup.logMarker

    val usageGroup = matchedUsageGroup.usageGroup
    val dbUsages = usageGroup.maybeStatus.fold(matchedUsageGroup.dbUsages) { status =>
      matchedUsageGroup.dbUsages.filter(dbUsage => dbUsage.status == status && !dbUsage.isRemoved)
    }
    val dbUsageMap = dbUsages.map(_.entry).toMap
    val dbUsageKeys = dbUsageMap.keySet
    val streamUsageMap = usageGroup.usages.map(_.entry).toMap
    val streamUsageKeys = streamUsageMap.keySet

    dbUsages.foreach(mediaUsage => logger.info(logMarker, s"Seen DB Usage for ${mediaUsage.mediaId}"))
    usageGroup.usages.foreach(mediaUsage => logger.info(logMarker, s"Seen Stream Usage for ${mediaUsage.mediaId}"))

    def performAndLogDBOperation(
      mediaUsage: MediaUsage,
      operationName: String
    )(operation: => Future[JsObject]): Future[(String, Boolean)] =
      Try(operation).fold(Future.failed, identity).transform {
        case Success(result) =>
          logger.info(
            logMarker,
            s"'$operationName' DB Operation for ${mediaUsage.grouping} - on mediaID: ${mediaUsage.mediaId} with result: $result"
          )
          usageMetrics.incrementUpdated
          Success(mediaUsage.mediaId -> true)
        case Failure(error) =>
          logger.error(
            logMarker,
            s"'$operationName' DB Operation failed for ${mediaUsage.grouping} - on mediaID: ${mediaUsage.mediaId}",
            error
          )
          usageMetrics.incrementErrors
          Success(mediaUsage.mediaId -> false)
      }

    val markAsRemovedOps = dbUsageKeys.diff(streamUsageKeys)
      .flatMap(dbUsageMap.get)
      .toSeq
      .map(mediaUsage => performAndLogDBOperation(mediaUsage, "markAsRemoved")(usageTable.markAsRemoved(mediaUsage)))

    val createOps = (if (usageGroup.isReindex) streamUsageKeys else streamUsageKeys.diff(dbUsageKeys))
      .flatMap(streamUsageMap.get)
      .toSeq
      .map(mediaUsage => performAndLogDBOperation(mediaUsage, "create")(usageTable.create(mediaUsage)))

    val updateOps = (if (usageGroup.isReindex) Set.empty else streamUsageKeys.intersect(dbUsageKeys))
      .flatMap(streamUsageMap.get)
      .diff(dbUsages)
      .toSeq
      .map(mediaUsage => performAndLogDBOperation(mediaUsage, "update")(usageTable.update(mediaUsage)))

    val implicatedMediaIds =
      (usageGroup.usages ++ dbUsages)
        .filter(_.isGridLikeId)
        .map(_.mediaId)

    Future.sequence(markAsRemovedOps ++ updateOps ++ createOps).map { results =>
      val failedMediaIds = results.collect { case (mediaId, false) => mediaId }.toSet
      val mediaIdsToNotify = implicatedMediaIds -- failedMediaIds
      logger.info(logMarker, s"Emitting ${mediaIdsToNotify.size} media IDs for notification")
      mediaIdsToNotify
    }
  }

  private def notifyPending(pending: PendingNotifications): Future[Seq[LogMarker]] =
    Future.traverse(pending.mediaIds.toSeq)(mediaId => notifyWithRetries(mediaId, pending.logMarker)).map(_.flatten)

  private def notifyWithRetries(mediaId: String, logMarker: LogMarker): Future[Option[LogMarker]] =
    retrying(
      usageNotifier.build(mediaId)(logMarker).flatMap { notice =>
        Future(usageNotifier.send(WithLogMarker(logMarker, notice)))(notificationExecutionContext)
      },
      maxAttempts = 5
    ) { (attempt, error) =>
      logger.error(MarkerMap("retry" -> attempt), s"Usage notification retry $attempt of 5 failed.", error)
      usageMetrics.incrementErrors
    }.map(Some(_)).recover { case error =>
      logger.error(logMarker ++ Map("image-id" -> mediaId), "Failed to send usage notification after 5 attempts.", error)
      usageMetrics.incrementErrors
      None
    }

  private def retrying[A](operation: => Future[A], maxAttempts: Int)(onRetry: (Int, Throwable) => Unit): Future[A] = {
    def attempt(attemptNumber: Int): Future[A] =
      Try(operation).fold(Future.failed, identity).recoverWith { case error =>
        if (attemptNumber >= maxAttempts) Future.failed(error)
        else {
          onRetry(attemptNumber, error)
          val backoff = (100L << (attemptNumber - 1)).millis
          after(backoff, scheduler)(attempt(attemptNumber + 1))
        }
      }

    attempt(1)
  }
}
