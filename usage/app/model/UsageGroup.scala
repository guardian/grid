package model

import com.gu.contentapi.client.model.v1.Content
import com.gu.contentapi.client.model.v1.{ElementType, Element}
import com.gu.mediaservice.model.{PrintUsageRecord, UsageStatus}
import com.gu.mediaservice.model.{PendingUsageStatus, PublishedUsageStatus}

import lib.{LiveContentApi, MD5, Config}
import org.joda.time.{DateTime, DateTimeZone}


case class UsageGroup(
  usages: Set[MediaUsage],
  grouping: String,
  status: UsageStatus,
  lastModified: DateTime,
  isReindex: Boolean = false
)
object UsageGroup {

  def buildId(contentWrapper: ContentWrapper) = contentWrapper.id
  def buildId(printUsage: PrintUsageRecord) = s"print/${MD5.hash(List(
    Some(printUsage.mediaId),
    Some(printUsage.printUsageMetadata.pageNumber),
    Some(printUsage.printUsageMetadata.sectionCode),
    Some(printUsage.printUsageMetadata.issueDate)
  ).flatten.map(_.toString).mkString("_"))}"

  def build(content: Content, status: UsageStatus, lastModified: DateTime, isReindex: Boolean) =
    ContentWrapper.build(content, status, lastModified).map(contentWrapper => {
      createUsages(contentWrapper, isReindex).map(usages => {
        UsageGroup(usages.toSet, contentWrapper.id, status, lastModified, isReindex)
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

  def createUsages(contentWrapper: ContentWrapper, isReindex: Boolean) =
    extractImages(
      contentWrapper.content,
      contentWrapper.status,
      isReindex
    ).map(_.zipWithIndex.map{ case (element, index) =>
      MediaUsage.build(ElementWrapper(index, element), contentWrapper)
    })

  def extractImages(content: Content, usageStatus: UsageStatus, isReindex: Boolean) = {

    val dateLimit = new DateTime(Config.usageDateLimit)
    val contentFirstPublished = LiveContentApi.getContentFirstPublished(content)

    val shouldRecordUsages = (usageStatus match {
      case _: PublishedUsageStatus => contentFirstPublished
        .map(_.isAfter(dateLimit)).getOrElse(false)
      case _ => true
    }) || isReindex

    def groupImageElements = content.elements.map(elements => {
      elements.filter(_.`type` == ElementType.Image)
        .groupBy(_.id)
        .map(_._2.head).to[collection.immutable.Seq]
    })

    if (shouldRecordUsages) { groupImageElements } else None
  }
}

case class ElementWrapper(index: Int, media: Element)
