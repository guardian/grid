package lib

import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap}
import com.gu.mediaservice.model.usage.MediaUsage
import model._
import org.apache.pekko.Done
import org.apache.pekko.actor.Scheduler
import org.apache.pekko.pattern.after
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.Sink
import play.api.libs.json.JsObject

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration._
import scala.util.Try

class UsageRecorder(
  usageMetrics: UsageMetrics,
  usageTable: UsageTable,
  usageNotifier: UsageNotifier,
  usageGroupStream: UsageGroupStream,
  scheduler: Scheduler
)(implicit materializer: Materializer, executionContext: ExecutionContext) extends GridLogging {

  private case class MatchedUsageGroup(logMarker: LogMarker, usageGroup: UsageGroup, dbUsages: Set[MediaUsage])

  private var maybeCompletion: Option[Future[Done]] = None

  def start(): Unit = {
    if (maybeCompletion.isEmpty) {
      maybeCompletion = Some(
        usageGroupStream.source
          .mapAsync(8)(processUsageGroup)
          .mapConcat(_.toList)
          .runWith(Sink.foreach(markers => logger.debug(markers, "Sent Usage Notification")))
      )
    }
  }

  def stop(): Future[Done] = {
    usageGroupStream.complete()
    maybeCompletion.getOrElse(Future.successful(Done))
  }

  private def processUsageGroup(usageGroupWithContext: WithLogMarker[UsageGroup]): Future[Seq[LogMarker]] = {
    val WithLogMarker(logMarker, usageGroup) = usageGroupWithContext

    for {
      matchedUsageGroup <- matchDb(usageGroupWithContext)
      mediaIds <- getUpdates(matchedUsageGroup)
      notices <- after(5.seconds, scheduler) {
        Future.traverse(mediaIds.toSeq)(id => notifyWithRetries(id, logMarker))
      }
    } yield notices
  }.recover { case error =>
    val WithLogMarker(logMarker, usageGroup) = usageGroupWithContext
    logger.error(logMarker ++ Map("usageGroup" -> usageGroup.grouping), "UsageRecorder encountered an error.", error)
    usageMetrics.incrementErrors
    Seq.empty
  }

  private def matchDb(usageGroupWithContext: WithLogMarker[UsageGroup]): Future[MatchedUsageGroup] = {
    val WithLogMarker(logMarker, usageGroup) = usageGroupWithContext

    retrying(usageTable.matchUsageGroup(usageGroupWithContext), maxRetries = 5) { (retriesSoFar, error) =>
      logger.error(
        logMarker ++ Map("retry" -> retriesSoFar),
        s"Encountered an error trying to match usage group (${usageGroup.grouping}) retry $retriesSoFar of 5",
        error
      )
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

    def performAndLogDBOperation(mediaUsage: MediaUsage, opName: String)(operation: => Future[JsObject]): Future[JsObject] =
      operation.map { result =>
        logger.info(
          logMarker,
          s"'$opName' DB Operation for ${mediaUsage.grouping} - on mediaID: ${mediaUsage.mediaId} with result: $result"
        )
        usageMetrics.incrementUpdated
        result
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

    val mediaIdsImplicatedInDBUpdates =
      (usageGroup.usages ++ dbUsages)
        .filter(_.isGridLikeId)
        .map(_.mediaId)

    Future.sequence(markAsRemovedOps ++ updateOps ++ createOps).map { _ =>
      logger.info(logMarker, s"Emitting ${mediaIdsImplicatedInDBUpdates.size} media IDs for notification")
      mediaIdsImplicatedInDBUpdates
    }
  }

  private def notifyWithRetries(mediaId: String, logMarker: LogMarker): Future[LogMarker] = {
    val maxRetries = 5
    retrying(
      usageNotifier.build(mediaId)(logMarker).flatMap { notice =>
        Future(usageNotifier.send(WithLogMarker(logMarker, notice)))
      },
      maxRetries
    ) { (retriesSoFar, error) =>
      logger.error(MarkerMap("retry" -> retriesSoFar), "UsageRecorder encountered an error.", error)
      if (retriesSoFar < maxRetries) usageMetrics.incrementErrors
    }
  }

  private def retrying[A](operation: => Future[A], maxRetries: Int)(onFailure: (Int, Throwable) => Unit): Future[A] = {
    def attempt(retriesSoFar: Int): Future[A] =
      Try(operation).fold(Future.failed, identity).recoverWith { case error =>
        onFailure(retriesSoFar, error)
        if (retriesSoFar < maxRetries) attempt(retriesSoFar + 1)
        else Future.failed(error)
      }

    attempt(0)
  }
}
