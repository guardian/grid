package model

import com.gu.contentapi.client.model.v1.{Content, ElementType, Element}


case class UsageGroup(
  usages: Set[MediaUsage],
  grouping: String,
  status: UsageStatus
)

object UsageGroup {
  def build(content: Content, status: UsageStatus) =
    createUsages(content, status).map(usages => UsageGroup(usages.toSet, content.id, status))

  def createUsages(content: Content, status: UsageStatus) = extractImages(content)
    .map(_.zipWithIndex.map{ case (element, index) =>
      MediaUsage.build(element, status, index, content.id)
    })

  def extractImages(content: Content) = content.elements.map(elements => {
    elements.filter(_.`type` == ElementType.Image)
  })
}
