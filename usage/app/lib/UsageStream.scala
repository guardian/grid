package lib

import rx.lang.scala.Observable
import org.joda.time.DateTime
import com.gu.contentapi.client.model.v1.{Content, ElementType, Element}


trait UsageStatus {
  val timestamp: DateTime
}

case class PendingUsageStatus(timestamp: DateTime) extends UsageStatus
case class PubishedUsageStatus(timestamp: DateTime) extends UsageStatus

case class MediaUsage(
  usageId: String,
  grouping: String,
  imageId: String,
  status: UsageStatus
)

object UsageStream {
  val contentStream = MergedContentStream.observable

  val observable = contentStream.flatMap((container: ContentContainer) =>
    Observable.from(createUsages(container.content, createStatus(container)))
  )

  def createUsageId(imageId: String, index: Int) = s"${imageId}_${index}"

  def createUsages(content: Content, status: UsageStatus) = extractImages(content)
    .map(_.zipWithIndex.map{ case (imageElement, index) => {
      createUsage(createUsageId(imageElement.id, index), content.id, imageElement, status)
    }}).getOrElse(List())

  def createStatus(container: ContentContainer) = container match {
    case PreviewContentItem(_,_) => PendingUsageStatus(container.lastModified)
    case LiveContentItem(_,_) => PubishedUsageStatus(container.lastModified)
  }

  def createUsage(id: String, group: String, imageElement: Element, status: UsageStatus) =
    MediaUsage(id, group, imageElement.id, status)

  def extractImages(content: Content) = content.elements.map(elements => {
    elements.filter(_.`type` == ElementType.Image)
  })
}
