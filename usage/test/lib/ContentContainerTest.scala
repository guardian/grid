package lib

import com.gu.contentapi.client.model.v1.{CapiDateTime, Content, ContentFields}
import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.model.usage.{PendingUsageStatus, PublishedUsageStatus}
import model.{UsageGroup, UsageGroupOps}
import org.joda.time.DateTime
import org.mockito.Mockito.when
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import rx.lang.scala.subjects.PublishSubject

import scala.collection.mutable.ListBuffer

class ContentContainerTest extends AnyFunSuite with Matchers with MockitoSugar {

  test("a taken-down preview emits a pending group followed by an empty published group") {
    implicit val logMarker: MarkerMap = MarkerMap("test" -> "content-container")
    val dateTime = DateTime.parse("2026-11-01T12:00:00Z")
    val content = Content.unsafeEmpty.copy(
      id = "content-id",
      fields = Some(ContentFields.unsafeEmpty.copy(
        firstPublicationDate = Some(CapiDateTime.unsafeEmpty),
        isLive = Some(false)
      ))
    )
    val group = UsageGroup(Set.empty, "content-id", dateTime)
    val usageGroupOps = mock[UsageGroupOps]
    when(usageGroupOps.build(content, PendingUsageStatus, dateTime, false))
      .thenReturn(Some(group))

    val subject = PublishSubject[WithLogMarker[UsageGroup]]()
    val emitted = ListBuffer.empty[WithLogMarker[UsageGroup]]
    val subscription = subject.subscribe(emitted += _)

    try {
      PreviewContentItem(content, dateTime).emitAsUsageGroup(subject, usageGroupOps)

      emitted.map(_.value).toList shouldBe List(
        group,
        group.copy(usages = Set.empty, maybeStatus = Some(PublishedUsageStatus))
      )
    } finally {
      subscription.unsubscribe()
    }
  }
}
