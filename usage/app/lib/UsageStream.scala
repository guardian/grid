package lib

import com.gu.crier.model.event.v1.EventPayload
import play.api.Logger

import _root_.rx.lang.scala.Observable
import com.gu.contentapi.client.model.v1.{Content, ElementType, Element}
import com.gu.mediaservice.model.{PendingUsageStatus, PublishedUsageStatus}

import model._

object UsageStream {

  val previewContentStream: Observable[ContentContainer] = PreviewCrierContentStream.observable
  val liveContentStream: Observable[ContentContainer] = LiveCrierContentStream.observable

  val previewObservable: Observable[UsageGroup] = getObservable(previewContentStream)

  val liveObservable: Observable[UsageGroup] = getObservable(liveContentStream)

  def createStatus(container: ContentContainer) = container match {
    case PreviewContentItem(_,_) => PendingUsageStatus()
    case LiveContentItem(_,_) => PublishedUsageStatus()
  }

  private def getObservable(contentStream: Observable[ContentContainer]) = {
    contentStream.flatMap((container: ContentContainer) => {

      val usageGroupOption: Option[Option[UsageGroup]] = UsageGroup
        .build(container.content, createStatus(container), container.lastModified)

      val observable: Observable[UsageGroup] = usageGroupOption match {
        case Some(usageGroup) => Observable.from(usageGroup)
        case _ => Observable.empty
      }

      observable
    })
  }

}
