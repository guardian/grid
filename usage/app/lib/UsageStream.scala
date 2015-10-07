package lib

import rx.lang.scala.Observable
import com.gu.contentapi.client.model.v1.{Content, ElementType, Element}

import model._


object UsageStream {
  val contentStream = MergedContentStream.observable

  val observable = contentStream.flatMap((container: ContentContainer) =>
    Observable.from(
      UsageGroup.build(container.content, createStatus(container), container.lastModified)))

  def createStatus(container: ContentContainer) = container match {
    case PreviewContentItem(_,_) => PendingUsageStatus()
    case LiveContentItem(_,_) => PubishedUsageStatus()
  }
}
