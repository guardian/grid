package lib

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model.usage._
import model.{UsageGroup, UsageTable}
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.{any, eq => eqTo}
import org.mockito.Mockito.{times, verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.Json
import rx.lang.scala.Observable

import java.util.concurrent.atomic.AtomicInteger
import scala.concurrent.{Await, Promise}
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
    val usageGroup = UsageGroup(Set(mediaUsage), "group-1", mediaUsage.lastModified)
    val usageGroupWithContext = WithLogMarker(logMarker, usageGroup)
    val matchedUsages = Set.empty[MediaUsage]
    val expectedMatch = WithLogMarker(logMarker, matchedUsages)
    val attempts = new AtomicInteger()
    val usageTable = mock[UsageTable]
    val matchResults: Observable[WithLogMarker[Set[MediaUsage]]] =
      UsageEffectTestSupport.failureThenSuccess[Observable, WithLogMarker[Set[MediaUsage]]](
        new IllegalStateException("temporary DynamoDB failure"),
        expectedMatch,
        attempts
      )
    when(usageTable.matchUsageGroup(usageGroupWithContext)).thenReturn(
      matchResults
    )
    val recorder = new UsageRecorder(mock[UsageMetrics], usageTable, mock[UsageNotifier], mock[UsageNotifier])

    val result = recorder.matchDb(usageGroupWithContext).toBlocking.single

    result.value.usageGroup shouldBe usageGroup
    result.value.dbUsages shouldBe matchedUsages
    result.logMarker shouldBe logMarker
    attempts.get() shouldBe 2
  }

  test("the recorder bridges database writes and notice building into its notification stream") {
    val usageGroup = UsageGroup(Set(mediaUsage), "group-1", mediaUsage.lastModified)
    val usageGroupWithContext = WithLogMarker(logMarker, usageGroup)
    val usageTable = mock[UsageTable]
    val usageMetrics = mock[UsageMetrics]
    val usageNotice = mock[UsageNotifier]
    val notice = UsageNotice("media-1", Json.arr())

    when(usageTable.matchUsageGroup(usageGroupWithContext))
      .thenReturn(UsageEffectTestSupport.successful[Observable, WithLogMarker[Set[MediaUsage]]](
        WithLogMarker(logMarker, Set.empty[MediaUsage])
      ))
    when(usageTable.create(mediaUsage)(logMarker))
      .thenReturn(UsageEffectTestSupport.successful[Observable, play.api.libs.json.JsObject](Json.obj("written" -> true)))
    when(usageNotice.build(any[String])(any[LogMarker]))
      .thenReturn(UsageEffectTestSupport.successful[Observable, UsageNotice](notice))

    val recorder = new UsageRecorder(usageMetrics, usageTable, usageNotice, mock[UsageNotifier])
    val result = Promise[WithLogMarker[UsageNotice]]()
    val subscription = recorder.notificationStream.subscribe(
      value => result.trySuccess(value),
      error => result.tryFailure(error),
      () => ()
    )

    try {
      recorder.usageApiSubject.onNext(usageGroupWithContext)
      val notification = Await.result(result.future, 15.seconds)

      notification.value shouldBe notice
      notification.logMarker shouldBe logMarker
      verify(usageTable).create(mediaUsage)(logMarker)
      verify(usageMetrics, times(1)).incrementUpdated
      verify(usageNotice).build(eqTo("media-1"))(any[LogMarker])
    } finally {
      subscription.unsubscribe()
    }
  }

}
