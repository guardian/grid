package lib

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model.usage._
import model.{UsageGroup, UsageTable}
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.SystemMaterializer
import org.apache.pekko.stream.scaladsl.{Keep, Sink}
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{after, never, timeout, verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.{JsArray, Json}

import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

class UsageRecorderTest extends AnyFunSuite with Matchers with MockitoSugar {

  private case class RecorderFixture(
    logMarker: MarkerMap,
    usageGroupStream: UsageGroupStream,
    usageTable: UsageTable,
    usageNotifier: UsageNotifier,
    usageMetrics: UsageMetrics,
    recorder: UsageRecorder
  )

  private def withRecorder(
    usageGroup: UsageGroup,
    dbUsages: Set[MediaUsage],
    notificationDelay: FiniteDuration = Duration.Zero
  )(test: RecorderFixture => Unit): Unit = {
    val actorSystem = ActorSystem("usage-recorder-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val executionContext = actorSystem.dispatcher
    val logMarker = MarkerMap("test" -> "usage-recorder")
    val usageTable = mock[UsageTable]
    val usageNotifier = mock[UsageNotifier]
    val usageMetrics = mock[UsageMetrics]
    when(usageNotifier.build(any[String])(any[LogMarker]))
      .thenReturn(Future.successful(UsageNotice("", JsArray())))
    when(usageNotifier.send(any[WithLogMarker[UsageNotice]])).thenReturn(logMarker)
    when(usageTable.matchUsageGroup(WithLogMarker(logMarker, usageGroup)))
      .thenReturn(Future.successful(WithLogMarker(logMarker, dbUsages)))
    val usageGroupStream = new UsageGroupStream
    val recorder = new UsageRecorder(
      usageMetrics,
      usageTable,
      usageNotifier,
      usageGroupStream,
      actorSystem.scheduler,
      notificationDelay
    )

    try {
      test(RecorderFixture(logMarker, usageGroupStream, usageTable, usageNotifier, usageMetrics, recorder))
    } finally {
      Await.result(recorder.stop(), 15.seconds)
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }

  test("the recorder consumes usage groups from the shared Pekko ingress") {
    val actorSystem = ActorSystem("usage-recorder-ingress-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val executionContext = actorSystem.dispatcher
    implicit val logMarker: MarkerMap = MarkerMap("test" -> "usage-recorder")
    val crierUsage = mediaUsage("media-crier")
    val apiUsage = mediaUsage("media-api")
    val crierGroup = UsageGroup(Set(crierUsage), "group-crier", DateTime.now())
    val apiGroup = UsageGroup(Set(apiUsage), "group-api", DateTime.now())
    val usageTable = mock[UsageTable]
    val usageNotifier = mock[UsageNotifier]
    val usageMetrics = mock[UsageMetrics]
    when(usageNotifier.build(any[String])(any[LogMarker]))
      .thenReturn(Future.successful(UsageNotice("", JsArray())))
    when(usageNotifier.send(any[WithLogMarker[UsageNotice]])).thenReturn(logMarker)
    when(usageTable.matchUsageGroup(WithLogMarker(logMarker, crierGroup)))
      .thenReturn(Future.successful(WithLogMarker(logMarker, Set.empty)))
    when(usageTable.matchUsageGroup(WithLogMarker(logMarker, apiGroup)))
      .thenReturn(Future.successful(WithLogMarker(logMarker, Set.empty)))
    when(usageTable.create(crierUsage)).thenReturn(Future.successful(Json.obj()))
    when(usageTable.create(apiUsage)).thenReturn(Future.successful(Json.obj()))

    val usageGroupStream = new UsageGroupStream
    val recorder = new UsageRecorder(
      usageMetrics,
      usageTable,
      usageNotifier,
      usageGroupStream,
      actorSystem.scheduler,
      Duration.Zero
    )
    recorder.start()

    try {
      Await.result(usageGroupStream.publish(WithLogMarker(logMarker, crierGroup)), 5.seconds)
      Await.result(usageGroupStream.publish(WithLogMarker(logMarker, apiGroup)), 5.seconds)

      verify(usageTable, timeout(5000)).create(crierUsage)
      verify(usageTable, timeout(5000)).create(apiUsage)
    } finally {
      Await.result(recorder.stop(), 15.seconds)
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }

  test("the queue rejects offers after completion") {
    val actorSystem = ActorSystem("usage-group-stream-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val executionContext = actorSystem.dispatcher
    val usageGroupStream = new UsageGroupStream
    val (queue, completion) = usageGroupStream.source.toMat(Sink.ignore)(Keep.both).run()
    usageGroupStream.attachQueue(queue)
    val group = UsageGroup(Set.empty, "group-closed", DateTime.now())

    try {
      Await.result(usageGroupStream.complete(), 5.seconds)
      Await.result(completion, 5.seconds)
      intercept[IllegalStateException] {
        Await.result(usageGroupStream.publish(WithLogMarker(MarkerMap("test" -> "closed"), group)), 5.seconds)
      }
    } finally {
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }

  test("the recorder removes, creates, and updates only the relevant database usages") {
    val grouping = "group-mixed"
    val existing = mediaUsage("media-old", "usage-shared", grouping)
    val updated = existing.copy(mediaId = "media-updated")
    val removed = mediaUsage("media-removed", "usage-removed", grouping)
    val pending = mediaUsage("media-pending", "usage-pending", grouping).copy(status = PendingUsageStatus)
    val created = mediaUsage("media-created", "usage-created", grouping)
    val group = UsageGroup(
      Set(updated, created),
      grouping,
      DateTime.parse("2026-11-01T12:00:00Z"),
      maybeStatus = Some(PublishedUsageStatus)
    )

    withRecorder(group, Set(existing, removed, pending)) { fixture =>
      implicit val logMarker = fixture.logMarker
      when(fixture.usageTable.markAsRemoved(removed)).thenReturn(Future.successful(Json.obj()))
      when(fixture.usageTable.create(created)).thenReturn(Future.successful(Json.obj()))
      when(fixture.usageTable.update(updated)).thenReturn(Future.successful(Json.obj()))
      fixture.recorder.start()

      Await.result(fixture.usageGroupStream.publish(WithLogMarker(logMarker, group)), 5.seconds)

      verify(fixture.usageTable, timeout(5000)).markAsRemoved(removed)
      verify(fixture.usageTable, timeout(5000)).create(created)
      verify(fixture.usageTable, timeout(5000)).update(updated)
      verify(fixture.usageTable, never()).markAsRemoved(pending)
    }
  }

  test("reindex recreates matching usages instead of updating them") {
    val usage = mediaUsage("media-reindexed", "usage-reindexed", "group-reindexed")
    val group = UsageGroup(
      Set(usage),
      "group-reindexed",
      DateTime.parse("2026-11-01T12:00:00Z"),
      isReindex = true
    )

    withRecorder(group, Set(usage)) { fixture =>
      implicit val logMarker = fixture.logMarker
      when(fixture.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))
      fixture.recorder.start()

      Await.result(fixture.usageGroupStream.publish(WithLogMarker(logMarker, group)), 5.seconds)

      verify(fixture.usageTable, timeout(5000)).create(usage)
      verify(fixture.usageTable, never()).update(usage)
      verify(fixture.usageTable, never()).markAsRemoved(usage)
    }
  }

  test("a failed write does not suppress notices for successful sibling writes") {
    val failedUsage = mediaUsage("media-failed", "usage-failed", "group-failure")
    val successfulUsage = mediaUsage("media-success", "usage-success", "group-failure")
    val group = UsageGroup(Set(failedUsage, successfulUsage), "group-failure", DateTime.now())
    val failure = new IllegalStateException("DynamoDB unavailable")

    withRecorder(group, Set.empty) { fixture =>
      implicit val logMarker = fixture.logMarker
      when(fixture.usageTable.create(failedUsage)).thenReturn(Future.failed(failure))
      when(fixture.usageTable.create(successfulUsage)).thenReturn(Future.successful(Json.obj()))
      fixture.recorder.start()

      Await.result(fixture.usageGroupStream.publish(WithLogMarker(logMarker, group)), 5.seconds)

      verify(fixture.usageNotifier, timeout(5000)).build(successfulUsage.mediaId)(logMarker)
      verify(fixture.usageNotifier, never()).build(failedUsage.mediaId)(logMarker)
      verify(fixture.usageMetrics).incrementErrors
    }
  }

  test("the recorder stops retrying after five failed group matches and continues with later groups") {
    val retryGroup = UsageGroup(Set.empty, "group-retry", DateTime.now())
    val usage = mediaUsage("media-after-retry")
    val succeedingGroup = UsageGroup(Set(usage), "group-after-retry", DateTime.now())
    val retryFailure = new IllegalStateException("DynamoDB unavailable")

    withRecorder(succeedingGroup, Set.empty) { fixture =>
      implicit val logMarker = fixture.logMarker
      when(fixture.usageTable.matchUsageGroup(WithLogMarker(logMarker, retryGroup)))
        .thenReturn(
          Future.failed(retryFailure),
          Future.failed(retryFailure),
          Future.failed(retryFailure),
          Future.failed(retryFailure),
          Future.failed(retryFailure)
        )
      when(fixture.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))
      fixture.recorder.start()

      Await.result(fixture.usageGroupStream.publish(WithLogMarker(logMarker, retryGroup)), 5.seconds)
      Await.result(fixture.usageGroupStream.publish(WithLogMarker(logMarker, succeedingGroup)), 5.seconds)

      verify(fixture.usageTable, timeout(5000).times(5)).matchUsageGroup(WithLogMarker(logMarker, retryGroup))
      verify(fixture.usageTable, timeout(5000)).create(usage)
      verify(fixture.usageMetrics, org.mockito.Mockito.times(5)).incrementErrors
    }
  }

  test("the recorder drains delayed notifications before stop completes") {
    val usage = mediaUsage("media-delayed", "usage-delayed", "group-delayed")
    val group = UsageGroup(Set(usage), "group-delayed", DateTime.now())
    val notice = UsageNotice("media-delayed", JsArray())

    withRecorder(group, Set.empty, notificationDelay = 1.second) { fixture =>
      implicit val logMarker = fixture.logMarker
      when(fixture.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))
      when(fixture.usageNotifier.build(usage.mediaId)(logMarker)).thenReturn(Future.successful(notice))
      when(fixture.usageNotifier.send(WithLogMarker(logMarker, notice))).thenReturn(logMarker)
      fixture.recorder.start()
      Await.result(fixture.usageGroupStream.publish(WithLogMarker(logMarker, group)), 5.seconds)

      val stopped = fixture.recorder.stop()
      stopped.isCompleted shouldBe false
      Await.result(stopped, 5.seconds)

      verify(fixture.usageNotifier).send(WithLogMarker(logMarker, notice))
    }
  }

  test("empty usage groups skip the notification delay") {
    val group = UsageGroup(Set.empty, "group-empty", DateTime.now())

    withRecorder(group, Set.empty, notificationDelay = 5.seconds) { fixture =>
      fixture.recorder.start()
      Await.result(fixture.usageGroupStream.publish(WithLogMarker(fixture.logMarker, group)), 5.seconds)

      Await.result(fixture.recorder.stop(), 2.seconds)
    }
  }

  private def mediaUsage(mediaId: String): MediaUsage =
    mediaUsage(mediaId, mediaId, s"group-$mediaId")

  private def mediaUsage(mediaId: String, usageId: String, grouping: String): MediaUsage = MediaUsage(
    usageId = UsageId(usageId),
    grouping = grouping,
    mediaId = mediaId,
    usageType = DigitalUsage,
    mediaType = "image",
    status = PublishedUsageStatus,
    printUsageMetadata = None,
    digitalUsageMetadata = None,
    syndicationUsageMetadata = None,
    frontUsageMetadata = None,
    downloadUsageMetadata = None,
    childUsageMetadata = None,
    lastModified = DateTime.parse("2026-11-01T12:00:00Z")
  )
}
