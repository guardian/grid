package lib

import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.lib.usage.UsageBuilder
import com.gu.mediaservice.model.usage._
import model.UsageTable
import org.joda.time.DateTime
import org.mockito.Mockito.when
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.{JsArray, Json}
import rx.lang.scala.Observable

import scala.concurrent.duration._
import scala.concurrent.{Await, Future, Promise}

class UsageNotifierTest extends AnyFunSuite with Matchers with MockitoSugar {

  private implicit val logMarker: MarkerMap = MarkerMap("test" -> "usage-notifier")

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

  private def awaitSingle[A](observable: Observable[A]): A = {
    val result = Promise[A]()
    observable.subscribe(
      value => result.trySuccess(value),
      error => result.tryFailure(error)
    )
    Await.result(result.future, 5.seconds)
  }

  private def awaitFailure[A](observable: Observable[A]): Throwable = {
    val result = Promise[Throwable]()
    observable.subscribe(
      (_: A) => (),
      error => result.trySuccess(error),
      () => ()
    )
    Await.result(result.future, 5.seconds)
  }

  test("build maps image usages to a notice and adds the image id to the log marker") {
    val table = mock[UsageTable]
    val expectedMarker = logMarker + ("image-id" -> "media-1")
    when(table.queryByImageId("media-1")(expectedMarker)).thenReturn(Future.successful(List(mediaUsage)))
    val notifier = new UsageNotifier(mock[UsageConfig], table)

    val notice = awaitSingle(notifier.build("media-1"))

    notice.mediaId shouldBe "media-1"
    notice.usageJson shouldBe Json.toJson(List(UsageBuilder.build(mediaUsage))).as[JsArray]
  }

  test("build propagates query failures") {
    val table = mock[UsageTable]
    val expectedMarker = logMarker + ("image-id" -> "media-1")
    val failure = new IllegalStateException("DynamoDB unavailable")
    when(table.queryByImageId("media-1")(expectedMarker)).thenReturn(Future.failed(failure))
    val notifier = new UsageNotifier(mock[UsageConfig], table)

    awaitFailure(notifier.build("media-1")) shouldBe failure
  }
}
