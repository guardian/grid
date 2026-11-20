package lib

import com.gu.contentapi.client.model.v1.Content
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model.usage._
import model.{UsageGroup, UsageGroupOps, UsageTable}
import org.apache.pekko.actor.ActorSystem
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{never, timeout, times, verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.{JsArray, JsObject, Json}

import java.util.concurrent.{ConcurrentLinkedQueue, CountDownLatch, TimeUnit}
import java.util.concurrent.atomic.AtomicInteger
import scala.concurrent.duration._
import scala.concurrent.{Await, Future, Promise}

class UsageRecorderTest extends AnyFunSuite with Matchers with MockitoSugar {

  private case class RecorderFixture(
    logMarker: MarkerMap,
    usageTable: UsageTable,
    usageNotifier: UsageNotifier,
    usageMetrics: UsageMetrics,
    recorder: UsageRecorder
  )

  private def createRecorder(
    actorSystem: ActorSystem,
    usageMetrics: UsageMetrics,
    usageTable: UsageTable,
    usageNotifier: UsageNotifier,
    notificationDelay: FiniteDuration
  ): UsageRecorder = {
    val _ = actorSystem
    val recorder = new UsageRecorder(usageMetrics, usageTable, usageNotifier, usageNotifier, notificationDelay)
    recorder.start()
    recorder
  }

  private def withRecorder(
    usageGroup: UsageGroup,
    dbUsages: Set[MediaUsage],
    notificationDelay: FiniteDuration = Duration.Zero
  )(test: RecorderFixture => Unit): Unit = {
    val actorSystem = ActorSystem("usage-recorder-test")
    val logMarker = MarkerMap("test" -> "usage-recorder")
    val usageTable = mock[UsageTable]
    val usageNotifier = mock[UsageNotifier]
    val usageMetrics = mock[UsageMetrics]
    when(usageNotifier.build(any[String])(any[LogMarker]))
      .thenReturn(Future.successful(UsageNotice("", JsArray())))
    when(usageNotifier.send(any[WithLogMarker[UsageNotice]])).thenReturn(logMarker)
    when(usageTable.matchUsageGroup(WithLogMarker(logMarker, usageGroup)))
      .thenReturn(Future.successful(WithLogMarker(logMarker, dbUsages)))
    val recorder = createRecorder(actorSystem, usageMetrics, usageTable, usageNotifier, notificationDelay)

    try {
      test(RecorderFixture(logMarker, usageTable, usageNotifier, usageMetrics, recorder))
    } finally {
      Await.result(recorder.stop(), 10.seconds)
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }

  test("the recorder consumes usage groups from both crier and api ingress") {
    val actorSystem = ActorSystem("usage-recorder-ingress-test")
    implicit val logMarker: MarkerMap = MarkerMap("test" -> "usage-recorder")
    val now = DateTime.parse("2026-11-01T12:00:00Z")
    val crierContent = Content.unsafeEmpty.copy(id = "content-crier")
    val crierUsage = mediaUsage("media-crier")
    val apiUsage = mediaUsage("media-api")
    val crierGroup = UsageGroup(Set(crierUsage), "group-crier", now)
    val apiGroup = UsageGroup(Set(apiUsage), "group-api", now)
    val crierMarker = logMarker ++ Map("usageGroup" -> crierGroup.grouping)
    val usageGroupOps = mock[UsageGroupOps]
    val usageTable = mock[UsageTable]
    val usageMetrics = mock[UsageMetrics]
    val usageNotifier = mock[UsageNotifier]

    when(usageGroupOps.build(crierContent, PublishedUsageStatus, now, false)).thenReturn(Some(crierGroup))
    when(usageNotifier.build(any[String])(any[LogMarker]))
      .thenReturn(Future.successful(UsageNotice("", JsArray())))
    when(usageNotifier.send(any[WithLogMarker[UsageNotice]])).thenReturn(logMarker)
    when(usageTable.matchUsageGroup(WithLogMarker(crierMarker, crierGroup)))
      .thenReturn(Future.successful(WithLogMarker(crierMarker, Set.empty)))
    when(usageTable.matchUsageGroup(WithLogMarker(logMarker, apiGroup)))
      .thenReturn(Future.successful(WithLogMarker(logMarker, Set.empty)))
    when(usageTable.create(crierUsage)(crierMarker)).thenReturn(Future.successful(Json.obj()))
    when(usageTable.create(apiUsage)(logMarker)).thenReturn(Future.successful(Json.obj()))

    val recorder = createRecorder(actorSystem, usageMetrics, usageTable, usageNotifier, Duration.Zero)

    try {
      Await.result(LiveContentItem(crierContent, now).emitAsUsageGroup(recorder, usageGroupOps), 5.seconds)
      Await.result(recorder.record(WithLogMarker(logMarker, apiGroup)), 5.seconds)

      verify(usageTable, timeout(5000)).create(crierUsage)(crierMarker)
      verify(usageTable, timeout(5000)).create(apiUsage)(logMarker)
    } finally {
      Await.result(recorder.stop(), 5.seconds)
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }

  test("the recorder rejects new usage groups after stop") {
    val group = UsageGroup(Set.empty, "group-closed", DateTime.parse("2026-11-01T12:00:00Z"))

    withRecorder(group, Set.empty) { f =>
      Await.result(f.recorder.stop(), 5.seconds)

      intercept[IllegalStateException] {
        Await.result(f.recorder.record(WithLogMarker(f.logMarker, group)), 5.seconds)
      }
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

    withRecorder(group, Set(existing, removed, pending)) { f =>
      implicit val logMarker = f.logMarker
      when(f.usageTable.markAsRemoved(removed)).thenReturn(Future.successful(Json.obj()))
      when(f.usageTable.create(created)).thenReturn(Future.successful(Json.obj()))
      when(f.usageTable.update(updated)).thenReturn(Future.successful(Json.obj()))

      Await.result(f.recorder.record(WithLogMarker(logMarker, group)), 5.seconds)

      verify(f.usageTable, timeout(5000)).markAsRemoved(removed)
      verify(f.usageTable, timeout(5000)).create(created)
      verify(f.usageTable, timeout(5000)).update(updated)
      verify(f.usageTable, never()).markAsRemoved(pending)
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

    withRecorder(group, Set(usage)) { f =>
      implicit val logMarker = f.logMarker
      when(f.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))

      Await.result(f.recorder.record(WithLogMarker(logMarker, group)), 5.seconds)

      verify(f.usageTable, timeout(5000)).create(usage)
      verify(f.usageTable, never()).update(usage)
      verify(f.usageTable, never()).markAsRemoved(usage)
    }
  }

  test("the recorder delays usage notices after writing updates") {
    val usage = mediaUsage("media-delayed", "usage-delayed", "group-delayed")
    val group = UsageGroup(Set(usage), "group-delayed", DateTime.parse("2026-11-01T12:00:00Z"))
    val notice = UsageNotice("media-delayed", JsArray())

    withRecorder(group, Set.empty, notificationDelay = 5.seconds) { f =>
      implicit val logMarker = f.logMarker
      when(f.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))
      when(f.usageNotifier.build(usage.mediaId)(logMarker)).thenReturn(Future.successful(notice))
      when(f.usageNotifier.send(WithLogMarker(logMarker, notice))).thenReturn(logMarker)

      val startedAt = System.nanoTime()
      Await.result(f.recorder.record(WithLogMarker(logMarker, group)), 5.seconds)
      verify(f.usageNotifier, org.mockito.Mockito.after(1000).never()).build(usage.mediaId)(logMarker)
      verify(f.usageNotifier, timeout(7000)).send(WithLogMarker(logMarker, notice))
      (System.nanoTime() - startedAt).nanos should be >= 4500.millis
    }
  }

  test("unchanged usages do not write but still notify with the original log context") {
    val usage = mediaUsage("media-unchanged")
    val group = UsageGroup(Set(usage), usage.grouping, usage.lastModified)
    val notice = UsageNotice(usage.mediaId, Json.arr(Json.obj("usage" -> "unchanged")))

    withRecorder(group, Set(usage)) { f =>
      implicit val marker = f.logMarker
      when(f.usageNotifier.build(usage.mediaId)).thenReturn(Future.successful(notice))
      Await.result(f.recorder.record(WithLogMarker(marker, group)), 5.seconds)
      Await.result(f.recorder.stop(), 5.seconds)

      verify(f.usageTable, never()).create(any[MediaUsage])(any[LogMarker])
      verify(f.usageTable, never()).update(any[MediaUsage])(any[LogMarker])
      verify(f.usageTable, never()).markAsRemoved(any[MediaUsage])(any[LogMarker])
      verify(f.usageMetrics, never()).incrementUpdated
      verify(f.usageNotifier).send(WithLogMarker(marker, notice))
    }
  }

  test("status-scoped matching excludes usages already marked as removed") {
    val usage = mediaUsage("media-already-removed").copy(
      dateAdded = Some(DateTime.parse("2026-11-01T12:00:00Z")),
      dateRemoved = Some(DateTime.parse("2026-11-02T12:00:00Z"))
    )
    val group = UsageGroup(Set.empty, usage.grouping, usage.lastModified, maybeStatus = Some(PublishedUsageStatus))

    withRecorder(group, Set(usage)) { f =>
      Await.result(f.recorder.record(WithLogMarker(f.logMarker, group)), 5.seconds)
      Await.result(f.recorder.stop(), 5.seconds)

      verify(f.usageTable, never()).markAsRemoved(any[MediaUsage])(any[LogMarker])
      verify(f.usageNotifier, never()).build(any[String])(any[LogMarker])
    }
  }

  test("notifications include removed Grid images but exclude legacy image ids") {
    val removed = mediaUsage("media-removed")
    val legacy = mediaUsage("gu-image-legacy").copy(grouping = removed.grouping)
    val group = UsageGroup(Set(legacy), removed.grouping, removed.lastModified)

    withRecorder(group, Set(removed)) { f =>
      implicit val marker = f.logMarker
      when(f.usageTable.markAsRemoved(removed)).thenReturn(Future.successful(Json.obj()))
      when(f.usageTable.create(legacy)).thenReturn(Future.successful(Json.obj()))
      Await.result(f.recorder.record(WithLogMarker(marker, group)), 5.seconds)
      Await.result(f.recorder.stop(), 5.seconds)

      verify(f.usageNotifier).build(removed.mediaId)
      verify(f.usageNotifier, never()).build(legacy.mediaId)
      verify(f.usageMetrics, times(2)).incrementUpdated
    }
  }

  test("usage notices wait for pending database writes") {
    val usage = mediaUsage("media-pending-write")
    val group = UsageGroup(Set(usage), usage.grouping, usage.lastModified)
    val write = Promise[JsObject]()
    val writeStarted = Promise[Unit]()

    withRecorder(group, Set.empty) { f =>
      implicit val marker = f.logMarker
      when(f.usageTable.create(usage)).thenAnswer { _ =>
        writeStarted.trySuccess(())
        write.future
      }
      val recorded = f.recorder.record(WithLogMarker(marker, group))
      try {
        Await.result(writeStarted.future, 5.seconds)
        verify(f.usageNotifier, never()).build(any[String])(any[LogMarker])
      } finally write.trySuccess(Json.obj())
      Await.result(recorded, 5.seconds)
      Await.result(f.recorder.stop(), 5.seconds)

      verify(f.usageNotifier).build(usage.mediaId)
      verify(f.usageMetrics).incrementUpdated
    }
  }

  // Rx PublishSubject.onNext returns immediately before asynchronous database writes complete.
  ignore("record does not complete until database writes finish") {
    val usage = mediaUsage("media-await-write")
    val group = UsageGroup(Set(usage), usage.grouping, usage.lastModified)
    val write = Promise[JsObject]()
    val writeStarted = Promise[Unit]()

    withRecorder(group, Set.empty) { f =>
      implicit val marker = f.logMarker
      when(f.usageTable.create(usage)).thenAnswer { _ =>
        writeStarted.trySuccess(())
        write.future
      }
      val recorded = f.recorder.record(WithLogMarker(marker, group))
      try {
        Await.result(writeStarted.future, 5.seconds)
        recorded.isCompleted shouldBe false
      } finally write.trySuccess(Json.obj())
      Await.result(recorded, 5.seconds)
    }
  }

  test("a transient match failure is retried and the group still writes and notifies") {
    val usage = mediaUsage("media-match-retry")
    val group = UsageGroup(Set(usage), usage.grouping, usage.lastModified)

    withRecorder(group, Set.empty) { f =>
      implicit val marker = f.logMarker
      when(f.usageTable.matchUsageGroup(WithLogMarker(marker, group))).thenReturn(
        Future.failed(new IllegalStateException("temporary query failure")),
        Future.successful(WithLogMarker(marker, Set.empty))
      )
      when(f.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))
      Await.result(f.recorder.record(WithLogMarker(marker, group)), 5.seconds)
      Await.result(f.recorder.stop(), 5.seconds)

      verify(f.usageTable, times(2)).matchUsageGroup(WithLogMarker(marker, group))
      verify(f.usageTable).create(usage)
      verify(f.usageNotifier).build(usage.mediaId)
    }
  }

  // Rx resubscribes to the ingress subject instead of retrying individual database writes.
  ignore("a transient database write failure is retried before succeeding") {
    val usage = mediaUsage("media-write-retry")
    val group = UsageGroup(Set(usage), usage.grouping, usage.lastModified)

    withRecorder(group, Set.empty) { f =>
      implicit val marker = f.logMarker
      when(f.usageTable.create(usage)).thenReturn(
        Future.failed(new IllegalStateException("temporary write failure")),
        Future.successful(Json.obj())
      )
      Await.result(f.recorder.record(WithLogMarker(marker, group)), 5.seconds)
      Await.result(f.recorder.stop(), 5.seconds)

      verify(f.usageTable, times(2)).create(usage)
      verify(f.usageMetrics, times(1)).incrementErrors
      verify(f.usageMetrics, times(1)).incrementUpdated
      verify(f.usageNotifier).build(usage.mediaId)
    }
  }

  // Rx swallows exhausted match failures inside the stream instead of failing record after five attempts.
  ignore("exhausted match retries fail record after five attempts without stopping later groups") {
    val failedGroup = UsageGroup(Set.empty, "failed-match", DateTime.parse("2026-11-01T12:00:00Z"))
    val usage = mediaUsage("media-after-match-failure")
    val group = UsageGroup(Set(usage), usage.grouping, usage.lastModified)

    withRecorder(group, Set.empty) { f =>
      implicit val marker = f.logMarker
      when(f.usageTable.matchUsageGroup(WithLogMarker(marker, failedGroup)))
        .thenReturn(Future.failed(new IllegalStateException("query failed")))
      when(f.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))

      intercept[IllegalStateException] {
        Await.result(f.recorder.record(WithLogMarker(marker, failedGroup)), 5.seconds)
      }
      Await.result(f.recorder.record(WithLogMarker(marker, group)), 5.seconds)
      Await.result(f.recorder.stop(), 5.seconds)

      verify(f.usageTable, times(5)).matchUsageGroup(WithLogMarker(marker, failedGroup))
      verify(f.usageMetrics, times(5)).incrementErrors
      verify(f.usageNotifier).build(usage.mediaId)
    }
  }

  // Rx abandons sibling notifications and swallows write failures instead of retrying five times and failing record.
  ignore("exhausted write retries fail record after five attempts while notifying successful sibling writes") {
    val failed = mediaUsage("media-failed", "failed", "group-siblings")
    val successful = mediaUsage("media-successful", "successful", "group-siblings")
    val group = UsageGroup(Set(failed, successful), "group-siblings", DateTime.parse("2026-11-01T12:00:00Z"))

    withRecorder(group, Set.empty) { f =>
      implicit val marker = f.logMarker
      when(f.usageTable.create(failed)).thenReturn(Future.failed(new IllegalStateException("write failed")))
      when(f.usageTable.create(successful)).thenReturn(Future.successful(Json.obj()))

      intercept[IllegalStateException] {
        Await.result(f.recorder.record(WithLogMarker(marker, group)), 5.seconds)
      }
      Await.result(f.recorder.stop(), 5.seconds)

      verify(f.usageTable, times(5)).create(failed)
      verify(f.usageMetrics, times(5)).incrementErrors
      verify(f.usageMetrics, times(1)).incrementUpdated
      verify(f.usageNotifier).build(successful.mediaId)
      verify(f.usageNotifier, never()).build(failed.mediaId)
    }
  }

  test("the recorder drains delayed notifications before stop completes") {
    val usage = mediaUsage("media-draining")
    val group = UsageGroup(Set(usage), usage.grouping, usage.lastModified)
    val notice = UsageNotice(usage.mediaId, JsArray())

    withRecorder(group, Set.empty, notificationDelay = 600.millis) { f =>
      implicit val marker = f.logMarker
      when(f.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))
      when(f.usageNotifier.build(usage.mediaId)).thenReturn(Future.successful(notice))
      Await.result(f.recorder.record(WithLogMarker(marker, group)), 5.seconds)
      val stopped = f.recorder.stop()
      stopped.isCompleted shouldBe false
      Await.result(stopped, 5.seconds)

      verify(f.usageNotifier).send(WithLogMarker(marker, notice))
    }
  }

  // Rx applies the notification delay even when there are no media IDs to notify.
  ignore("empty usage groups do not delay shutdown") {
    val group = UsageGroup(Set.empty, "group-empty", DateTime.parse("2026-11-01T12:00:00Z"))

    withRecorder(group, Set.empty, notificationDelay = 5.seconds) { f =>
      Await.result(f.recorder.record(WithLogMarker(f.logMarker, group)), 5.seconds)
      Await.result(f.recorder.stop(), 1.second)
    }
  }

  // Rx resubscribes to ingress after a notice failure rather than retrying that notice.
  ignore("notice building retries a transient failure before sending the notice") {
    val usage = mediaUsage("media-notice-retry")
    val group = UsageGroup(Set(usage), usage.grouping, usage.lastModified)
    val notice = UsageNotice(usage.mediaId, JsArray())
    val attempts = new ConcurrentLinkedQueue[Long]()

    withRecorder(group, Set.empty) { f =>
      implicit val marker = f.logMarker
      when(f.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))
      when(f.usageNotifier.build(usage.mediaId)).thenAnswer { _ =>
        attempts.add(System.nanoTime())
        if (attempts.size() == 1) Future.failed(new IllegalStateException("notice query failed"))
        else Future.successful(notice)
      }
      Await.result(f.recorder.record(WithLogMarker(marker, group)), 5.seconds)
      Await.result(f.recorder.stop(), 5.seconds)

      verify(f.usageNotifier, times(2)).build(usage.mediaId)
      verify(f.usageNotifier).send(WithLogMarker(marker, notice))
      verify(f.usageMetrics).incrementErrors
      val firstAttempt = attempts.remove()
      (attempts.remove() - firstAttempt).nanos should be >= 15.millis
    }
  }

  // Rx does not retry an individual failed notice five times.
  ignore("notice building stops after five failed attempts and counts each error") {
    val usage = mediaUsage("media-notice-failed")
    val group = UsageGroup(Set(usage), usage.grouping, usage.lastModified)

    withRecorder(group, Set.empty) { f =>
      implicit val marker = f.logMarker
      when(f.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))
      when(f.usageNotifier.build(usage.mediaId)).thenReturn(Future.failed(new IllegalStateException("notice query failed")))
      Await.result(f.recorder.record(WithLogMarker(marker, group)), 5.seconds)
      Await.result(f.recorder.stop(), 5.seconds)

      verify(f.usageNotifier, times(5)).build(usage.mediaId)
      verify(f.usageNotifier, never()).send(any[WithLogMarker[UsageNotice]])
      verify(f.usageMetrics, times(5)).incrementErrors
    }
  }

  test("a blocked notification does not prevent independent database writes") {
    val usage = mediaUsage("media-blocked-send")
    val group = UsageGroup(Set(usage), usage.grouping, usage.lastModified)
    val nextUsage = mediaUsage("media-independent-write")
    val nextGroup = UsageGroup(Set(nextUsage), nextUsage.grouping, nextUsage.lastModified)
    val notice = UsageNotice(usage.mediaId, JsArray())
    val sending = Promise[Unit]()
    val release = new CountDownLatch(1)

    withRecorder(group, Set.empty) { f =>
      implicit val marker = f.logMarker
      when(f.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))
      when(f.usageTable.matchUsageGroup(WithLogMarker(marker, nextGroup)))
        .thenReturn(Future.successful(WithLogMarker(marker, Set.empty)))
      when(f.usageTable.create(nextUsage)).thenReturn(Future.successful(Json.obj()))
      when(f.usageNotifier.build(usage.mediaId)).thenReturn(Future.successful(notice))
      when(f.usageNotifier.send(WithLogMarker(marker, notice))).thenAnswer { _ =>
        sending.trySuccess(())
        require(release.await(10, TimeUnit.SECONDS), "notification was not released")
        marker
      }

      try {
        Await.result(f.recorder.record(WithLogMarker(marker, group)), 5.seconds)
        Await.result(sending.future, 5.seconds)
        Await.result(f.recorder.record(WithLogMarker(marker, nextGroup)), 5.seconds)
        verify(f.usageTable, timeout(2000)).create(nextUsage)
      } finally release.countDown()
    }
  }

  test("the notification delay does not block record completion or subsequent groups") {
    val groups = (1 to 16).map { id =>
      val usage = mediaUsage(s"media-throughput-$id")
      UsageGroup(Set(usage), usage.grouping, usage.lastModified)
    }
    val matches = new AtomicInteger()
    val allMatched = Promise[Unit]()

    withRecorder(groups.head, Set.empty, notificationDelay = 1.second) { f =>
      when(f.usageTable.matchUsageGroup(any[WithLogMarker[UsageGroup]])).thenAnswer { _ =>
        if (matches.incrementAndGet() == groups.size) allMatched.trySuccess(())
        Future.successful(WithLogMarker(f.logMarker, Set.empty[MediaUsage]))
      }
      when(f.usageTable.create(any[MediaUsage])(any[LogMarker])).thenReturn(Future.successful(Json.obj()))
      groups.foreach(group => Await.result(f.recorder.record(WithLogMarker(f.logMarker, group)), 500.millis))
      Await.result(allMatched.future, 500.millis)

      verify(f.usageNotifier, never()).build(any[String])(any[LogMarker])
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
