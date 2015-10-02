package lib

import rx.lang.scala.Observable
import com.gu.contentapi.client.model.v1.{Content, ElementType, Element}

import model._


object UsageStream {
  val contentStream = MergedContentStream.observable

  val observable = contentStream.flatMap((container: ContentContainer) =>
    Observable.from(createUsageGroup(container.content, createStatus(container)))
  )

  def createUsageId(imageId: String, index: Int) = s"${imageId}_${index}"

  def createUsageGroup(content: Content, status: UsageStatus) =
    createUsages(content, status).map(usages => UsageGroup(usages.toSet, content.id, status))

  def createUsages(content: Content, status: UsageStatus) = extractImages(content)
    .map(_.zipWithIndex.map{ case (imageElement, index) => {
      createUsage(createUsageId(imageElement.id, index), content.id, imageElement)
    }})

  def createStatus(container: ContentContainer) = container match {
    case PreviewContentItem(_,_) => PendingUsageStatus(container.lastModified)
    case LiveContentItem(_,_) => PubishedUsageStatus(container.lastModified)
  }

  def createUsage(id: String, group: String, imageElement: Element) =
    MediaUsage(id, group, imageElement)

  def extractImages(content: Content) = content.elements.map(elements => {
    elements.filter(_.`type` == ElementType.Image)
  })
}
