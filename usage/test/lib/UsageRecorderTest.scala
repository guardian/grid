package lib

import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.model.usage._
import model.{UsageGroup, UsageTable}
import org.joda.time.DateTime
import org.mockito.Mockito.{timeout, verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.Json

import scala.concurrent.Future

class UsageRecorderTest extends AnyFunSuite with Matchers with MockitoSugar {

  test("the recorder consumes usage groups from both crier and api ingress") {
    implicit val logMarker: MarkerMap = MarkerMap("test" -> "usage-recorder")
    val crierUsage = mediaUsage("media-crier")
    val apiUsage = mediaUsage("media-api")
    val crierGroup = UsageGroup(Set(crierUsage), "group-crier", DateTime.now())
    val apiGroup = UsageGroup(Set(apiUsage), "group-api", DateTime.now())
    val usageTable = mock[UsageTable]
    val usageMetrics = mock[UsageMetrics]
    val usageNotifier = mock[UsageNotifier]

    when(usageTable.matchUsageGroup(WithLogMarker(logMarker, crierGroup)))
      .thenReturn(Future.successful(WithLogMarker(logMarker, Set.empty)))
    when(usageTable.matchUsageGroup(WithLogMarker(logMarker, apiGroup)))
      .thenReturn(Future.successful(WithLogMarker(logMarker, Set.empty)))
    when(usageTable.create(crierUsage)).thenReturn(Future.successful(Json.obj()))
    when(usageTable.create(apiUsage)).thenReturn(Future.successful(Json.obj()))

    val recorder = new UsageRecorder(usageMetrics, usageTable, usageNotifier, usageNotifier)
    recorder.start()

    try {
      CrierUsageStream.observable.onNext(WithLogMarker(logMarker, crierGroup))
      recorder.usageApiSubject.onNext(WithLogMarker(logMarker, apiGroup))

      verify(usageTable, timeout(5000)).create(crierUsage)
      verify(usageTable, timeout(5000)).create(apiUsage)
    } finally {
      recorder.stop()
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
