package model

import com.gu.contentapi.client.model.v1.{Content, ElementType, Element}

import org.joda.time.DateTime


case class UsageGroup(
  usages: Set[MediaUsage],
  grouping: String,
  status: UsageStatus,
  lastModified: DateTime
) {
  override def equals(obj: Any): Boolean = obj match {
    case usageGroup: UsageGroup => {
      grouping == usageGroup.grouping &&
      status.toString == usageGroup.status.toString &&
      usages == usageGroup.usages
    }
    case _ => false
  }
}

object UsageGroup {
  def build(content: Content, status: UsageStatus, lastModified: DateTime) =
    createUsages(content, status, lastModified).map(usages => {
      UsageGroup(usages.toSet, content.id, status, lastModified)
    })

  def createUsages(content: Content, status: UsageStatus, lastModified: DateTime) = extractImages(content)
    .map(_.zipWithIndex.map{ case (element, index) =>
      MediaUsage.build(element, status, index, content.id, lastModified)
    })

  def extractImages(content: Content) = content.elements.map(elements => {
    elements.filter(_.`type` == ElementType.Image)
  })
}
