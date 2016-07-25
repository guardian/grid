package model

import com.gu.contentapi.client.model.v1.Content
import com.gu.contentapi.client.model.v1.{ElementType, Element, BlockElement, CapiDateTime, ImageElementFields}
import com.gu.mediaservice.model.{PrintUsageRecord, UsageStatus}

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
    extractImages(contentWrapper.content, contentWrapper.status).map(_.zipWithIndex.map{ case (element, index) =>
      MediaUsage.build(ElementWrapper(index, element), contentWrapper)
    })

  def extractImages(content: Content, usageStatus: UsageStatus) = {
    val imageElements = for {
      blocks <- content.blocks.toList

      allBlocks = blocks.body.getOrElse(List()) ++ blocks.main
      block <- allBlocks

      publishedDate = block.publishedDate

      elements = block.elements.zipWithIndex
      elementTuple <- elements
      elementFields = elementTuple._1
      elementIndex  = elementTuple._2

      if elementFields.`type` == ElementType.Image

      imageFields <- elementFields.imageTypeData.toList
    } yield ImageElementWrapper(
      publishedDate,
      imageFields,
      elementIndex,
      usageStatus
    )

    imageElements
      .groupBy(_.imageElementFields.mediaId)
      .map(_._2.head).to[collection.immutable.Seq]

    content.elements.map(elements => {
      elements.filter(_.`type` == ElementType.Image)
        .groupBy(_.id)
        .map(_._2.head).to[collection.immutable.Seq]
    })
  }
}

case class ImageElementWrapper(
  publishedDate: Option[CapiDateTime],
  imageElementFields: ImageElementFields,
  index: Int,
  status: UsageStatus
)

case class ElementWrapper(index: Int, media: Element)
