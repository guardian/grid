package lib

import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model.usage.MediaUsage
import model._
import org.apache.pekko.actor.Scheduler
import org.apache.pekko.pattern.after
import play.api.libs.json._

import java.util.concurrent.{ConcurrentHashMap, Executors}
import java.util.concurrent.atomic.AtomicBoolean
import scala.concurrent.duration.{Duration, DurationInt, FiniteDuration}
import scala.concurrent.{ExecutionContext, ExecutionContextExecutorService, Future}
import scala.jdk.CollectionConverters._
import scala.util.control.NonFatal

trait UsageGroupRecorder {
  def record(usageGroup: WithLogMarker[UsageGroup]): Future[Unit]
}

class UsageRecorder(
  usageMetrics: UsageMetrics,
  usageTable: UsageTable,
  usageNotifier: UsageNotifier,
  scheduler: Scheduler,
  notificationDelay: FiniteDuration = 5.seconds,
  retryBackoff: FiniteDuration = 100.millis
)(implicit ec: ExecutionContext = ExecutionContext.global) extends GridLogging with UsageGroupRecorder {

  private val maxAttempts = 5
  private val stopped = new AtomicBoolean(false)
  private val inFlightNotifications = ConcurrentHashMap.newKeySet[Future[Unit]]()
  // UsageNotifier.send blocks on synchronous SNS publish, so isolate it from the caller ExecutionContext.
  private val notificationExecutionContext: ExecutionContextExecutorService =
    ExecutionContext.fromExecutorService(Executors.newFixedThreadPool(4))

  case class MatchedUsageGroup(usageGroup: UsageGroup, dbUsages: Set[MediaUsage])

  private def retrying[A](operation: () => Future[A])(onFailure: (Int, Throwable) => Unit): Future[A] = {
    def loop(attemptNumber: Int): Future[A] =
      Future.unit.flatMap(_ => operation()).recoverWith {
        case NonFatal(error) =>
          onFailure(attemptNumber, error)
          if (attemptNumber >= maxAttempts) {
            Future.failed(error)
          } else {
            val delay = retryBackoff * (1L << (attemptNumber - 1))
            after(delay, scheduler)(loop(attemptNumber + 1))
          }
      }

    loop(1)
  }

  def matchDb(usageGroupWithContext: WithLogMarker[UsageGroup]): Future[WithLogMarker[MatchedUsageGroup]] = {
    val WithLogMarker(logMarker, usageGroup) = usageGroupWithContext
    retrying(() => usageTable.matchUsageGroup(usageGroupWithContext)) { (attempt, error) =>
      logger.error(
        logMarker ++ Map("retry" -> attempt),
        s"Encountered an error trying to match usage group (${usageGroup.grouping}) attempt $attempt of $maxAttempts",
        error
      )
      usageMetrics.incrementErrors
    }.map { dbUsagesWithContext =>
      logger.info(dbUsagesWithContext.logMarker, s"Built MatchedUsageGroup for ${usageGroup.grouping}")
      WithLogMarker(dbUsagesWithContext.logMarker, MatchedUsageGroup(usageGroup, dbUsagesWithContext.value))
    }
  }

  private def performDbOperation(
    func: MediaUsage => Future[JsObject],
    opName: String
  )(mediaUsage: MediaUsage)(implicit logMarker: LogMarker): Future[Either[(String, Throwable), Unit]] =
    retrying(() => func(mediaUsage)) { (attempt, error) =>
      logger.error(
        logMarker ++ Map("retry" -> attempt),
        s"Encountered an error trying to perform '$opName' DB operation for ${mediaUsage.grouping} on mediaID: ${mediaUsage.mediaId} attempt $attempt of $maxAttempts",
        error
      )
      usageMetrics.incrementErrors
    }.map { result =>
      logger.info(
        logMarker,
        s"'$opName' DB Operation for ${mediaUsage.grouping} - on mediaID: ${mediaUsage.mediaId} with result: $result"
      )
      usageMetrics.incrementUpdated
      Right(())
    }.recover {
      case NonFatal(error) => Left(mediaUsage.mediaId -> error)
    }

  private def applyUpdates(matchedUsageGroupWithContext: WithLogMarker[MatchedUsageGroup]): Future[Unit] = {
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

    dbUsages.foreach(mediaUsage => logger.info(logMarker, s"Seen DB Usage for ${mediaUsage.mediaId}"))
    usageGroup.usages.foreach(mediaUsage => logger.info(logMarker, s"Seen Stream Usage for ${mediaUsage.mediaId}"))

    val markAsRemovedOps = dbUsageKeys.diff(streamUsageKeys)
      .flatMap(dbUsageMap.get)
      .toSeq
      .map(performDbOperation(usageTable.markAsRemoved, "markAsRemoved"))

    val createOps = (if (usageGroup.isReindex) streamUsageKeys else streamUsageKeys.diff(dbUsageKeys))
      .flatMap(streamUsageMap.get)
      .toSeq
      .map(performDbOperation(usageTable.create, "create"))

    val updateOps = (if (usageGroup.isReindex) Set.empty else streamUsageKeys.intersect(dbUsageKeys))
      .flatMap(streamUsageMap.get)
      // Avoid redundant DynamoDB writes when usage metadata has not changed.
      .diff(dbUsages)
      .toSeq
      .map(performDbOperation(usageTable.update, "update"))

    val mediaIdsImplicatedInDBUpdates =
      (usageGroup.usages ++ dbUsages)
        .filter(_.isGridLikeId)
        .map(_.mediaId)

    Future.sequence(markAsRemovedOps ++ updateOps ++ createOps).flatMap { results =>
      val failures = results.collect { case Left(failure) => failure }
      val failedMediaIds = failures.map(_._1).toSet
      val mediaIdsToNotify = mediaIdsImplicatedInDBUpdates.diff(failedMediaIds)

      if (mediaIdsToNotify.nonEmpty) {
        logger.info(logMarker, s"Scheduling ${mediaIdsToNotify.size} media IDs for notification")
        scheduleNotifications(logMarker, mediaIdsToNotify)
      }

      failures.headOption.fold(Future.unit) { case (_, error) => Future.failed(error) }
    }
  }

  private def scheduleNotifications(logMarker: LogMarker, mediaIds: Set[String]): Unit = {
    // DynamoDB's media_id GSI is eventually consistent, so wait before querying usages to build notices.
    val notification =
      if (notificationDelay <= Duration.Zero) sendNotifications(logMarker, mediaIds)
      else after(notificationDelay, scheduler)(sendNotifications(logMarker, mediaIds))

    inFlightNotifications.add(notification)
    notification.onComplete(_ => inFlightNotifications.remove(notification))
  }

  private def sendNotifications(logMarker: LogMarker, mediaIds: Set[String]): Future[Unit] = {
    logger.info(logMarker, s"Building ${mediaIds.size} usage notices")
    Future.traverse(mediaIds)(notifyMedia(logMarker, _)).map(_ => ())
  }

  private def notifyMedia(logMarker: LogMarker, mediaId: String): Future[Unit] =
    retrying { () =>
      usageNotifier.build(mediaId)(logMarker).flatMap { notice =>
        Future {
          val markers = usageNotifier.send(WithLogMarker(logMarker, notice))
          logger.debug(markers, "Sent Usage Notification")
        }(notificationExecutionContext)
      }
    } { (attempt, error) =>
      logger.error(
        logMarker ++ Map("retry" -> attempt, "image-id" -> mediaId),
        s"UsageRecorder encountered an error notifying $mediaId attempt $attempt of $maxAttempts",
        error
      )
      usageMetrics.incrementErrors
    }.recover {
      case NonFatal(_) => ()
    }

  override def record(usageGroup: WithLogMarker[UsageGroup]): Future[Unit] =
    if (stopped.get()) Future.failed(new IllegalStateException("UsageRecorder is stopped"))
    else matchDb(usageGroup).flatMap(applyUpdates)

  private def drainNotifications(): Future[Unit] = {
    val pending = inFlightNotifications.asScala.toList
    if (pending.isEmpty) Future.unit
    else Future.sequence(pending).flatMap { _ =>
      pending.foreach(inFlightNotifications.remove)
      drainNotifications()
    }
  }

  private lazy val shutdownFuture: Future[Unit] =
    drainNotifications().andThen { case _ => notificationExecutionContext.shutdown() }

  def stop(): Future[Unit] = {
    stopped.set(true)
    shutdownFuture
  }
}
