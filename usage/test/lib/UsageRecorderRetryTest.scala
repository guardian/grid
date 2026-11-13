package lib

import com.gu.mediaservice.lib.logging.MarkerMap
import model.{UsageGroup, UsageTable}
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.SystemMaterializer
import org.joda.time.DateTime
import org.mockito.Mockito.{times, verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

import scala.concurrent.duration._
import scala.concurrent.{Await, Future, Promise}

class UsageRecorderRetryTest extends AnyFunSuite with Matchers with MockitoSugar {

  test("a failed usage group match is retried with a fresh Future") {
    val actorSystem = ActorSystem("usage-recorder-retry-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val logMarker: MarkerMap = MarkerMap("test" -> "usage-recorder-retry")
    val group = UsageGroup(Set.empty, "group-1", DateTime.parse("2026-11-01T12:00:00Z"))
    val usageGroupWithContext = WithLogMarker(logMarker, group)
    val usageTable = mock[UsageTable]
    val failure = new IllegalStateException("temporary DynamoDB failure")
    when(usageTable.matchUsageGroup(usageGroupWithContext))
      .thenReturn(
        Future.failed(failure),
        Future.successful(WithLogMarker(logMarker, Set.empty))
      )
    val usageNotifier = mock[UsageNotifier]
    val recorder = new UsageRecorder(
      mock[UsageMetrics],
      usageTable,
      usageNotifier,
      usageNotifier,
      mock[UsageGroupStream]
    )

    try {
      val result = recorder.matchDb(usageGroupWithContext).toBlocking.single

      result.value.usageGroup shouldBe group
      result.value.dbUsages shouldBe empty
      verify(usageTable, times(2)).matchUsageGroup(usageGroupWithContext)
    } finally {
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }
  test("a usage group match stops retrying after five attempts") {
    val actorSystem = ActorSystem("usage-recorder-retry-limit-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val logMarker: MarkerMap = MarkerMap("test" -> "usage-recorder-retry")
    val group = UsageGroup(Set.empty, "group-1", DateTime.parse("2026-11-01T12:00:00Z"))
    val usageGroupWithContext = WithLogMarker(logMarker, group)
    val usageTable = mock[UsageTable]
    val failure = new IllegalStateException("DynamoDB unavailable")
    when(usageTable.matchUsageGroup(usageGroupWithContext))
      .thenReturn(
        Future.failed(failure),
        Future.failed(failure),
        Future.failed(failure),
        Future.failed(failure),
        Future.failed(failure)
      )
    val usageNotifier = mock[UsageNotifier]
    val recorder = new UsageRecorder(
      mock[UsageMetrics],
      usageTable,
      usageNotifier,
      usageNotifier,
      mock[UsageGroupStream]
    )
    val terminalError = Promise[Throwable]()

    try {
      recorder.matchDb(usageGroupWithContext).subscribe(
        (_: WithLogMarker[recorder.MatchedUsageGroup]) => (),
        error => terminalError.trySuccess(error)
      )

      Await.result(terminalError.future, 5.seconds) shouldBe failure
      verify(usageTable, times(5)).matchUsageGroup(usageGroupWithContext)
    } finally {
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }
}
