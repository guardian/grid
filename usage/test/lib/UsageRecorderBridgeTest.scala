package lib

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model.usage._
import model.{UsageGroup, UsageTable}
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.SystemMaterializer
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.{any, eq => eqTo}
import org.mockito.Mockito.{times, timeout, verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.JsObject
import play.api.libs.json.Json

import java.util.concurrent.atomic.AtomicInteger
import scala.concurrent.{Await, Future}
import scala.concurrent.duration._

class UsageRecorderBridgeTest extends AnyFunSuite with Matchers with MockitoSugar {

  private implicit val logMarker: MarkerMap = MarkerMap("test" -> "usage-recorder-bridge")

  private val mediaUsage = MediaUsage(
    usageId = UsageId("usage-1"),
    grouping = "group-1",
    mediaId = "media-1",
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

  test("matchDb retries a failed match and preserves the group and log marker") {
    val actorSystem = ActorSystem("usage-recorder-bridge-retry-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val executionContext = actorSystem.dispatcher
    val usageGroup = UsageGroup(Set(mediaUsage), "group-1", mediaUsage.lastModified)
    val usageGroupWithContext = WithLogMarker(logMarker, usageGroup)
    val matchedUsages = Set.empty[MediaUsage]
    val expectedMatch = WithLogMarker(logMarker, matchedUsages)
    val attempts = new AtomicInteger()
    val usageTable = mock[UsageTable]
    when(usageTable.matchUsageGroup(usageGroupWithContext)).thenAnswer(_ =>
      UsageEffectTestSupport.failureThenSuccess[Future, WithLogMarker[Set[MediaUsage]]](
        new IllegalStateException("temporary DynamoDB failure"),
        expectedMatch,
        attempts
      )
    )
    val recorder = new UsageRecorder(
      mock[UsageMetrics],
      usageTable,
      mock[UsageNotifier],
      mock[UsageNotifier],
      new UsageGroupStream
    )

    try {
      val result = recorder.matchDb(usageGroupWithContext).toBlocking.single

      result.value.usageGroup shouldBe usageGroup
      result.value.dbUsages shouldBe matchedUsages
      result.logMarker shouldBe logMarker
      attempts.get() shouldBe 2
    } finally {
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }

  test("the recorder bridges database writes and notice building into its notification stream") {
    val actorSystem = ActorSystem("usage-recorder-bridge-notice-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val executionContext = actorSystem.dispatcher
    val usageGroup = UsageGroup(Set(mediaUsage), "group-1", mediaUsage.lastModified)
    val usageGroupWithContext = WithLogMarker(logMarker, usageGroup)
    val usageTable = mock[UsageTable]
    val usageMetrics = mock[UsageMetrics]
    val usageNotice = mock[UsageNotifier]
    val usageNotifier = mock[UsageNotifier]
    val usageGroupStream = new UsageGroupStream
    val notice = UsageNotice("media-1", Json.arr())

    when(usageTable.matchUsageGroup(usageGroupWithContext))
      .thenReturn(UsageEffectTestSupport.successful[Future, WithLogMarker[Set[MediaUsage]]](
        WithLogMarker(logMarker, Set.empty[MediaUsage])
      ))
    when(usageTable.create(mediaUsage)(logMarker))
      .thenReturn(UsageEffectTestSupport.successful[Future, JsObject](Json.obj("written" -> true)))
    when(usageNotice.build(any[String])(any[LogMarker]))
      .thenReturn(UsageEffectTestSupport.successful[Future, UsageNotice](notice))

    when(usageNotifier.send(any[WithLogMarker[UsageNotice]])).thenReturn(logMarker)
    val recorder = new UsageRecorder(usageMetrics, usageTable, usageNotice, usageNotifier, usageGroupStream)
    recorder.start()

    try {
      Await.result(usageGroupStream.publish(usageGroupWithContext), 5.seconds)
      verify(usageNotifier, timeout(15000)).send(eqTo(WithLogMarker(logMarker, notice)))
      verify(usageTable).create(mediaUsage)(logMarker)
      verify(usageMetrics, times(1)).incrementUpdated
      verify(usageNotice).build(eqTo("media-1"))(any[LogMarker])
    } finally {
      Await.result(recorder.stop(), 5.seconds)
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }

}
