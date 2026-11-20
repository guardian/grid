package lib

import com.gu.contentapi.client.model.v1.Content
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model.usage._
import model.{UsageGroup, UsageGroupOps, UsageTable}
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{timeout, verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.{JsArray, Json}

import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

class UsageRecorderTest extends AnyFunSuite with Matchers with MockitoSugar {

  test("the recorder consumes usage groups from both crier and api ingress") {
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

    val recorder = new UsageRecorder(
      usageMetrics,
      usageTable,
      usageNotifier,
      usageNotifier,
      notificationDelay = Duration.Zero
    )
    recorder.start()

    try {
      Await.result(LiveContentItem(crierContent, now).emitAsUsageGroup(recorder, usageGroupOps), 5.seconds)
      Await.result(recorder.record(WithLogMarker(logMarker, apiGroup)), 5.seconds)

      verify(usageTable, timeout(5000)).create(crierUsage)(crierMarker)
      verify(usageTable, timeout(5000)).create(apiUsage)(logMarker)
    } finally {
      Await.result(recorder.stop(), 5.seconds)
    }
  }

  private def mediaUsage(mediaId: String): MediaUsage = MediaUsage(
    usageId = UsageId(mediaId),
    grouping = s"group-$mediaId",
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
