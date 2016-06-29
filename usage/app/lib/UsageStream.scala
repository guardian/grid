package lib

import play.api.Logger

import _root_.rx.lang.scala.Observable
import com.gu.contentapi.client.model.v1.{Content, ElementType, Element}
import com.gu.mediaservice.model.{PendingUsageStatus, PublishedUsageStatus}

import model._

object UsageStream {
  val contentStream = MergedContentStream.observable

  val observable = contentStream.flatMap((container: ContentContainer) => {
    println("now got a container ", container)
    val usageGroupOption = UsageGroup
      .build(container.content, createStatus(container), container.lastModified)

    usageGroupOption match {
      case Some(usageGroup) => Observable.from(usageGroup)
      case _ => Observable.empty
    }
  })

  def createStatus(container: ContentContainer) = container match {
    case PreviewContentItem(_,_) => PendingUsageStatus()
    case LiveContentItem(_,_) => PublishedUsageStatus()
  }
}
