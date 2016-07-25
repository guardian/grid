package model

import com.gu.contentapi.client.model.v1.Content
import com.gu.contentapi.client.model.v1.{ElementType, Element, BlockElement, CapiDateTime, ImageElementFields}
import com.gu.mediaservice.model.{PrintUsageRecord, UsageStatus}

import lib.{MD5, UsageMetadataBuilder}
import org.joda.time.DateTime
import org.joda.time.DateTimeZone


case class UsageGroup(
  usages: Set[MediaUsage],
  grouping: String,
  status: UsageStatus,
  lastModified: DateTime
)
object UsageGroup {

  def buildId(printUsage: PrintUsageRecord) = s"print/${MD5.hash(List(
    Some(printUsage.mediaId),
    Some(printUsage.printUsageMetadata.pageNumber),
    Some(printUsage.printUsageMetadata.sectionCode),
    Some(printUsage.printUsageMetadata.issueDate)
  ).flatten.map(_.toString).mkString("_"))}"

  def build(content: Content, status: UsageStatus, lastModified: DateTime) =
    ContentWrapper.build(
      content,
      status,
      lastModified
    ).map(contentWrapper => {
        val group = UsageGroup(
          createUsages(contentWrapper).toSet,
          contentWrapper.id,
          status,
          lastModified
        )

        if (group.usages.isEmpty) {
          None
        } else {
          Some(group)
        }
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

  def createUsages(contentWrapper: ContentWrapper): Seq[MediaUsage] = {
    val images = extractImages(
      contentWrapper.content,
      contentWrapper.status,
      contentWrapper.lastModified
    )

    val usageMetadata = UsageMetadataBuilder
      .build(contentWrapper.content)

    images.map(MediaUsage.build(_, usageMetadata, contentWrapper.id))
  }

  def extractImages(
    content: Content,
    usageStatus: UsageStatus,
    lastModified: DateTime
  ): Seq[ImageElementWrapper] = for {
      blocks <- content.blocks.toList

      allBlocks = blocks.body.getOrElse(List()) ++ blocks.main
      block <- allBlocks

      publishedDate = block.publishedDate
        .map(d => new DateTime(d.dateTime, DateTimeZone.UTC))
        .getOrElse(lastModified)

      elements = block.elements.zipWithIndex
      elementTuple <- elements
      elementFields = elementTuple._1
      elementIndex  = elementTuple._2

      if elementFields.`type` == ElementType.Image

      imageFields <- elementFields.imageTypeData.toList
      imageId <- imageFields.mediaId

    } yield ImageElementWrapper(
      imageId,
      publishedDate,
      imageFields,
      elementIndex,
      usageStatus
    )

}

case class ImageElementWrapper(
  imageId: String,
  publishedDate: DateTime,
  imageElementFields: ImageElementFields,
  index: Int,
  status: UsageStatus
)
