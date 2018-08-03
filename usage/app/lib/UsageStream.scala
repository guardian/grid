package lib

import com.gu.mediaservice.model.usage.{PendingUsageStatus, PublishedUsageStatus}
import model._
import rx.lang.scala.Observable

class UsageStream(usageGroup: UsageGroupOps) {

  val previewContentStream: Observable[ContentContainer] = PreviewCrierContentStream.observable
  val liveContentStream: Observable[ContentContainer] = LiveCrierContentStream.observable

  val previewObservable: Observable[UsageGroup] = getObservable(previewContentStream)

  val liveObservable: Observable[UsageGroup] = getObservable(liveContentStream)

  def createStatus(container: ContentContainer) = container match {
    case PreviewContentItem(_,_,_) => PendingUsageStatus
    case LiveContentItem(_,_,_) => PublishedUsageStatus
  }

  private def getObservable(contentStream: Observable[ContentContainer]) = {
    contentStream.flatMap((container: ContentContainer) => {
      val usageGroupOption: Option[UsageGroup] = usageGroup.build(container.content, createStatus(container), container.lastModified, container.isReindex)

      val observable: Observable[UsageGroup] = usageGroupOption match {
        case Some(usgGroup) => Observable.from(Some(usgGroup))
        case _ => Observable.empty
      }

      observable
    })
  }

}
