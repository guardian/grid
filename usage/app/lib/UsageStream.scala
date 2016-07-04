package lib

import _root_.rx.lang.scala.Observable
import com.gu.contentapi.client.model.v1.{Content, ElementType, Element}
import com.gu.mediaservice.model.{PendingUsageStatus, PublishedUsageStatus}

import model._

object UsageStream {

  val liveContentStream: Observable[ContentContainer] = LiveCrierContentStream.observable
  val previewContentStream: Observable[ContentContainer] = PreviewCrierContentStream.observable

  val liveObservable: Observable[UsageGroup] = liveContentStream.flatMap((container: ContentContainer) => {

    println("now container ", container)
    val usageGroupOption: Option[Option[UsageGroup]] = UsageGroup
      .build(container.content, createStatus(container), container.lastModified)

    val observable: Observable[UsageGroup] = usageGroupOption match {
      case Some(usageGroup) => Observable.from(usageGroup)
      case _ => Observable.empty
    }

    observable
  })

  val previewObservable: Observable[UsageGroup] = previewContentStream.flatMap((container: ContentContainer) => {
    println("now container ", container)

    val usageGroupOption: Option[Option[UsageGroup]] = UsageGroup
      .build(container.content, createStatus(container), container.lastModified)

    val observable: Observable[UsageGroup] = usageGroupOption match {
      case Some(usageGroup) => Observable.from(usageGroup)
      case _ => Observable.empty
    }

    observable
  })

  def createStatus(container: ContentContainer) = container match {
    case PreviewContentItem(_,_) => PendingUsageStatus()
    case LiveContentItem(_,_) => PublishedUsageStatus()
  }
}
