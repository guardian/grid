package lib

import com.gu.contentapi.client.model.v1.{CapiDateTime, Content, ContentFields}
import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.model.usage.{PendingUsageStatus, PublishedUsageStatus}
import model.{UsageGroup, UsageGroupOps}
import org.apache.pekko.Done
import org.joda.time.DateTime
import org.mockito.Mockito.when
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

import scala.concurrent.{Await, Future}
import scala.concurrent.duration._

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
    val usageGroupStream = mock[UsageGroupStream]
    val groupedLogMarker = logMarker ++ Map("usageGroup" -> group.grouping)
    val takenDownGroup = group.copy(usages = Set.empty, maybeStatus = Some(PublishedUsageStatus))
    when(usageGroupStream.publish(WithLogMarker(groupedLogMarker, group))).thenReturn(Future.successful(Done))
    when(usageGroupStream.publish(WithLogMarker(groupedLogMarker, takenDownGroup))).thenReturn(Future.successful(Done))

    Await.result(PreviewContentItem(content, dateTime).emitAsUsageGroup(usageGroupStream, usageGroupOps), 5.seconds)

    val publishingOrder = org.mockito.Mockito.inOrder(usageGroupStream)
    publishingOrder.verify(usageGroupStream).publish(WithLogMarker(groupedLogMarker, group))
    publishingOrder.verify(usageGroupStream).publish(WithLogMarker(groupedLogMarker, takenDownGroup))
  }
}
