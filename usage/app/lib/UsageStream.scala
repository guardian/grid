package lib

import play.api.Logger

import rx.lang.scala.Observable
import com.gu.contentapi.client.model.v1.{Content, ElementType, Element}

import model._


object UsageStream {
  val contentStream = MergedContentStream.observable

  val rawObservable = contentStream.flatMap((container: ContentContainer) => {
    val usageGroupOption = UsageGroup
      .build(container.content, createStatus(container), container.lastModified)

    usageGroupOption match {
      case Some(usageGroup) => Observable.from(usageGroup)
      case _ => Observable.empty
    }
  })

  val observable = rawObservable.onErrorResumeNext(error => {
      Logger.error("UsageStream encountered an error", error)
      UsageMetrics.incrementErrors

      rawObservable
  })


  def createStatus(container: ContentContainer) = container match {
    case PreviewContentItem(_,_) => PendingUsageStatus()
    case LiveContentItem(_,_) => PublishedUsageStatus()
  }
}
