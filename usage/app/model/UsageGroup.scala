package model

import play.api.Logger
import play.api.libs.json._

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
    ).map(_.zipWithIndex.map{ case (element, index) => {
      val usage = MediaUsage.build(ElementWrapper(index, element), contentWrapper)

      Logger.info(s"Built MediaUsage for ${usage.mediaId}")

      usage.digitalUsageMetadata.map(meta => {
        Logger.info(s"MediaUsage for ${usage.mediaId}: ${Json.toJson(meta)}")
      })

      usage.printUsageMetadata.map(meta => {
        Logger.info(s"MediaUsage for ${usage.mediaId}: ${Json.toJson(meta)}")
      })

      usage
    }})

  def extractImages(content: Content, usageStatus: UsageStatus, isReindex: Boolean) = {
    // Generate unique UUID to track extract job
    val uuid = java.util.UUID.randomUUID.toString

    Logger.info(s"Extracting images (job-${uuid}) from ${content.id}")

    val dateLimit = new DateTime(Config.usageDateLimit)
    val contentFirstPublished = LiveContentApi.getContentFirstPublished(content)
    val isNew = usageStatus match {
      case _: PublishedUsageStatus => contentFirstPublished
        .map(_.isAfter(dateLimit)).getOrElse(false)
      case _ => true
    }

    val shouldRecordUsages = isNew || isReindex

    def groupImageElements: Option[Seq[Element]] = content.elements.map(elements => {
      elements.filter(_.`type` == ElementType.Image)
        .groupBy(_.id)
        .map(_._2.head).to[collection.immutable.Seq]
    })

    if (shouldRecordUsages) {
      Logger.info(s"Passed shouldRecordUsages (job-${uuid})")

      val groupedElements = groupImageElements
      if(groupedElements.isEmpty) {
        Logger.info(s"No Matching elements found (job-${uuid})")

      } else {
        groupedElements.map(elements => {
          Logger.info(s"${elements.length} elements found (job-${uuid})")

          elements.map(e => {
            Logger.info(s"Matching element ${e.id} found (job-${uuid})")
          })
        })

      }

      groupedElements
    } else {
      Logger.info(s"Failed shouldRecordUsages: isNew-${isNew} isReindex-${isReindex} (job-${uuid})")

      None
    }
  }
}

case class ElementWrapper(index: Int, media: Element)
