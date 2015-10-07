package model

import com.gu.contentapi.client.model.v1.{Content, ElementType, Element}

import org.joda.time.DateTime


case class UsageGroup(
  usages: Set[MediaUsage],
  grouping: String,
  status: UsageStatus,
  lastModified: DateTime
)
object UsageGroup {
  def build(content: Content, status: UsageStatus, lastModified: DateTime) =
    // At the moment we only care about composer usages
    content.fields.map(_.internalComposerCode).flatMap(_.map(composerCode => {
      val contentId = s"composer/${composerCode}"

      createUsages(contentId, content, status, lastModified).map(usages => {
        UsageGroup(usages.toSet, contentId, status, lastModified)
      })
    }))

  def createUsages(contentId: String, content: Content, status: UsageStatus, lastModified: DateTime) = extractImages(content)
    .map(_.zipWithIndex.map{ case (element, index) =>
      MediaUsage.build(element, status, index, contentId, lastModified)
    })

  def extractImages(content: Content) = content.elements.map(elements => {
    elements.filter(_.`type` == ElementType.Image)
  })
}
