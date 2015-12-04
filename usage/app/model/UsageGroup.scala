package model

import com.gu.contentapi.client.model.v1.{Content, ElementType, Element}

import lib.MD5
import org.joda.time.DateTime


case class UsageGroup(
  usages: Set[MediaUsage],
  grouping: String,
  status: UsageStatus,
  lastModified: DateTime
)
object UsageGroup {

  def buildId(contentWrapper: ContentWrapper) = contentWrapper.id
  def buildId(printUsage: PrintUsageRecord) = s"print/${MD5.hash(List(
    Some(printUsage.mediaId),
    Some(printUsage.printUsageDetails.pageNumber),
    Some(printUsage.printUsageDetails.edition),
    Some(printUsage.printUsageDetails.layoutId),
    Some(printUsage.printUsageDetails.sectionCode),
    Some(printUsage.printUsageDetails.issueDate)
  ).flatten.map(_.toString).mkString("_"))}"

  def build(content: Content, status: UsageStatus, lastModified: DateTime) =
    ContentWrapper.build(content, status, lastModified).map(contentWrapper => {
      createUsages(contentWrapper).map(usages => {
        UsageGroup(usages.toSet, contentWrapper.id, status, lastModified)
      })
    })

  def build(printUsageRecords: List[PrintUsageRecord]) =
    printUsageRecords.map(printUsageRecord => {
      val usageId = UsageId.build(printUsageRecord)

      UsageGroup(
        Set(MediaUsage.build(printUsageRecord, usageId)),
        usageId.toString,
        printUsageRecord.usageStatus,
        printUsageRecord.dateAdded
      )
    })

  def createUsages(contentWrapper: ContentWrapper) =
    extractImages(contentWrapper.content).map(_.zipWithIndex.map{ case (element, index) =>
      MediaUsage.build(ElementWrapper(index, element), contentWrapper)
    })

  def extractImages(content: Content) = content.elements.map(elements => {
    elements.filter(_.`type` == ElementType.Image)
  })
}

case class ElementWrapper(index: Int, media: Element)
