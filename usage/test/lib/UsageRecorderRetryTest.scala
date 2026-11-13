package lib

import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.model.usage._
import model.{UsageGroup, UsageTable}
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.SystemMaterializer
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{never, times, verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.Json

import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

class UsageRecorderRetryTest extends AnyFunSuite with Matchers with MockitoSugar {

  test("usage notice building stops after five failed attempts and counts each error") {
    val actorSystem = ActorSystem("usage-recorder-retry-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val executionContext = actorSystem.dispatcher
    implicit val logMarker: MarkerMap = MarkerMap("test" -> "usage-recorder-retry")
    val usage = MediaUsage(
      usageId = UsageId("usage-retry"),
      grouping = "group-retry",
      mediaId = "media-retry",
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
    val group = UsageGroup(Set(usage), usage.grouping, usage.lastModified)
    val table = mock[UsageTable]
    val notifier = mock[UsageNotifier]
    val metrics = mock[UsageMetrics]
    val stream = new UsageGroupStream
    val failure = new IllegalStateException("temporary Kinesis failure")
    when(table.matchUsageGroup(WithLogMarker(logMarker, group)))
      .thenReturn(Future.successful(WithLogMarker(logMarker, Set.empty)))
    when(table.create(usage)).thenReturn(Future.successful(Json.obj()))
    when(notifier.build(usage.mediaId)(logMarker)).thenReturn(
      Future.failed(failure),
      Future.failed(failure),
      Future.failed(failure),
      Future.failed(failure),
      Future.failed(failure)
    )

    val recorder = new UsageRecorder(
      metrics,
      table,
      notifier,
      stream,
      actorSystem.scheduler,
      notificationDelay = Duration.Zero
    )
    recorder.start()

    try {
      Await.result(stream.publish(WithLogMarker(logMarker, group)), 5.seconds)
      Await.result(recorder.stop(), 10.seconds)

      verify(table).create(usage)
      verify(notifier, times(5)).build(usage.mediaId)(logMarker)
      verify(notifier, never()).send(any[WithLogMarker[UsageNotice]])
      verify(metrics, times(5)).incrementErrors
    } finally {
      Await.result(recorder.stop(), 10.seconds)
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }
}
