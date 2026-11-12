package lib

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model.usage._
import model.{UsageGroup, UsageTable}
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.SystemMaterializer
import org.apache.pekko.stream.scaladsl.{Keep, Sink}
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
