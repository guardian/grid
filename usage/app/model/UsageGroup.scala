package model

import com.gu.contentapi.client.model.v1.Content
import com.gu.contentapi.client.model.v1.{ElementType, Element}
import com.gu.mediaservice.model.{PrintUsageRecord, UsageStatus}
import com.gu.mediaservice.model.{PendingUsageStatus, PublishedUsageStatus}

import lib.{MD5, Config}
import org.joda.time.{DateTime, DateTimeZone}


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
    Some(printUsage.printUsageMetadata.pageNumber),
    Some(printUsage.printUsageMetadata.sectionCode),
    Some(printUsage.printUsageMetadata.issueDate)
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
    extractImages(
      contentWrapper.content,
      contentWrapper.status
    ).map(_.zipWithIndex.map{ case (element, index) =>
      MediaUsage.build(ElementWrapper(index, element), contentWrapper)
    })

  def extractImages(content: Content, usageStatus: UsageStatus) = {

    val dateLimit = new DateTime(Config.usageDateLimit)

    val shouldRecordUsages = (usageStatus match {
      case _: PublishedUsageStatus => (for {
        fields <- content.fields
        firstPublicationDate <- fields.firstPublicationDate
        date = new DateTime(firstPublicationDate , DateTimeZone.UTC)
        if date.isAfter(dateLimit)
      } yield true).getOrElse(false)

      case _ => true
    })

    def groupImageElements = content.elements.map(elements => {
      elements.filter(_.`type` == ElementType.Image)
        .groupBy(_.id)
        .map(_._2.head).to[collection.immutable.Seq]
    })

    if (shouldRecordUsages) { groupImageElements } else None
  }
}

case class ElementWrapper(index: Int, media: Element)
