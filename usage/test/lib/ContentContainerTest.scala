package lib

import com.gu.contentapi.client.model.v1.{CapiDateTime, Content, ContentFields}
import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.model.usage.{PendingUsageStatus, PublishedUsageStatus, UsageStatus}
import model.{UsageGroup, UsageGroupOps}
import org.joda.time.DateTime
import org.mockito.Mockito.{verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

import scala.collection.mutable.ListBuffer
import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

class ContentContainerTest extends AnyFunSuite with Matchers with MockitoSugar {
  private implicit val marker: MarkerMap = MarkerMap("requestId" -> "content-container-test")
  private val modified = DateTime.parse("2026-11-01T12:00:00Z")

  private def emitted(
    item: ContentContainer,
    ops: UsageGroupOps
  ): List[WithLogMarker[UsageGroup]] = {
    val groups = ListBuffer.empty[WithLogMarker[UsageGroup]]
    val recorder: UsageGroupRecorder = group => {
      groups += group
      Future.unit
    }
    Await.result(item.emitAsUsageGroup(recorder, ops), 5.seconds)
    groups.toList
  }

  private def check(item: ContentContainer, status: UsageStatus): Unit = {
    val ops = mock[UsageGroupOps]
    val group = UsageGroup(Set.empty, item.content.id, modified, item.isReindex, Some(status))
    when(ops.build(item.content, status, modified, item.isReindex)).thenReturn(Some(group))

    emitted(item, ops) shouldBe List(WithLogMarker(marker ++ Map("usageGroup" -> group.grouping), group))
    verify(ops).build(item.content, status, modified, item.isReindex)
  }

  test("live content preserves published status, reindex flag, timestamp and log context") {
    check(LiveContentItem(Content.unsafeEmpty.copy(id = "live-content"), modified, isReindex = true), PublishedUsageStatus)
  }

  test("preview content emits pending usages without clearing published usages") {
    check(PreviewContentItem(Content.unsafeEmpty.copy(id = "preview-content"), modified), PendingUsageStatus)
  }

  test("a taken-down preview emits its pending group before clearing published usages") {
    val content = Content.unsafeEmpty.copy(
      id = "taken-down",
      fields = Some(ContentFields.unsafeEmpty.copy(
        firstPublicationDate = Some(CapiDateTime.unsafeEmpty),
        isLive = Some(false)
      ))
    )
    val ops = mock[UsageGroupOps]
    val group = UsageGroup(Set.empty, content.id, modified, maybeStatus = Some(PendingUsageStatus))
    when(ops.build(content, PendingUsageStatus, modified, false)).thenReturn(Some(group))
    val context = marker ++ Map("usageGroup" -> content.id)

    emitted(PreviewContentItem(content, modified), ops) shouldBe List(
      WithLogMarker(context, group),
      WithLogMarker(context, group.copy(maybeStatus = Some(PublishedUsageStatus)))
    )
  }

  test("content without a usage group emits nothing") {
    val content = Content.unsafeEmpty.copy(id = "no-fields")
    val ops = mock[UsageGroupOps]
    when(ops.build(content, PublishedUsageStatus, modified, false)).thenReturn(None)

    emitted(LiveContentItem(content, modified), ops) shouldBe empty
  }
}
