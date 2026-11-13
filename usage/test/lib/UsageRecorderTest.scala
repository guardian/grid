package lib

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model.usage._
import model.{UsageGroup, UsageTable}
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.SystemMaterializer
import org.apache.pekko.stream.scaladsl.{Keep, Sink}
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{never, timeout, verify, when}
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
    dbUsages: Set[MediaUsage]
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
    val recorder = new UsageRecorder(usageMetrics, usageTable, usageNotifier, usageNotifier, usageGroupStream)

    try {
      test(RecorderFixture(logMarker, usageGroupStream, usageTable, usageNotifier, usageMetrics, recorder))
    } finally {
      Await.result(recorder.stop(), 15.seconds)
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }

  test("the recorder consumes usage groups from the shared Pekko ingress") {
    val actorSystem = ActorSystem("usage-recorder-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val executionContext = actorSystem.dispatcher
    implicit val logMarker: MarkerMap = MarkerMap("test" -> "usage-recorder")
    val crierUsage = mediaUsage("media-crier")
    val apiUsage = mediaUsage("media-api")
    val crierGroup = UsageGroup(Set(crierUsage), "group-crier", DateTime.now())
    val apiGroup = UsageGroup(Set(apiUsage), "group-api", DateTime.now())
    val usageTable = mock[UsageTable]
    val usageMetrics = mock[UsageMetrics]
    val usageNotifier = mock[UsageNotifier]

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
    val recorder = new UsageRecorder(usageMetrics, usageTable, usageNotifier, usageNotifier, usageGroupStream)
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

  test("the shared ingress rejects offers after it is completed") {
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

  test("a failed database write increments the recorder error metric") {
    val usage = mediaUsage("media-failed", "usage-failed", "group-failed")
    val group = UsageGroup(Set(usage), "group-failed", DateTime.parse("2026-11-01T12:00:00Z"))
    val failure = new IllegalStateException("DynamoDB unavailable")

    withRecorder(group, Set.empty) { fixture =>
      when(fixture.usageTable.create(usage)(fixture.logMarker)).thenReturn(Future.failed(failure))
      fixture.recorder.start()

      Await.result(fixture.usageGroupStream.publish(WithLogMarker(fixture.logMarker, group)), 5.seconds)

      verify(fixture.usageMetrics, timeout(5000)).incrementErrors
    }
  }

  test("the recorder delays usage notices after writing updates") {
    val usage = mediaUsage("media-delayed", "usage-delayed", "group-delayed")
    val group = UsageGroup(Set(usage), "group-delayed", DateTime.now())
    val notice = UsageNotice("media-delayed", JsArray())

    withRecorder(group, Set.empty) { fixture =>
      implicit val logMarker = fixture.logMarker
      when(fixture.usageTable.create(usage)).thenReturn(Future.successful(Json.obj()))
      when(fixture.usageNotifier.build(usage.mediaId)(logMarker)).thenReturn(Future.successful(notice))
      when(fixture.usageNotifier.send(WithLogMarker(logMarker, notice))).thenReturn(logMarker)
      fixture.recorder.start()

      val startedAt = System.nanoTime()
      Await.result(fixture.usageGroupStream.publish(WithLogMarker(logMarker, group)), 5.seconds)
      verify(fixture.usageNotifier, org.mockito.Mockito.after(1000).never()).build(usage.mediaId)(logMarker)
      verify(fixture.usageNotifier, timeout(7000)).send(WithLogMarker(logMarker, notice))
      (System.nanoTime() - startedAt).nanos should be >= 4500.millis
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
