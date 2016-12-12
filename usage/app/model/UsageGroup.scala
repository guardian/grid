package model

import play.api.Logger
import play.api.libs.json._
import com.gu.contentapi.client.model.v1.{Content, Element, ElementType}
import com.gu.contentatom.thrift.AtomType.Media
import com.gu.contentatom.thrift.Atom
import com.gu.contentatom.thrift.atom.media.MediaAtom
import com.gu.mediaservice.model.{PrintUsageRecord, UsageStatus}
import com.gu.mediaservice.model.PublishedUsageStatus
import lib.{Config, LiveContentApi, MD5}
import org.joda.time.DateTime


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
      val usages = createUsages(contentWrapper, isReindex)
      Logger.info(s"Built UsageGroup: ${contentWrapper.id}")
      UsageGroup(usages.toSet, contentWrapper.id, status, lastModified, isReindex)
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

  def createUsages(contentWrapper: ContentWrapper, isReindex: Boolean) = {
    // Generate unique UUID to track extract job
    val uuid = java.util.UUID.randomUUID.toString

    val content = contentWrapper.content
    val usageStatus = contentWrapper.status

    Logger.info(s"Extracting images (job-${uuid}) from ${content.id}")

    val mediaAtomsUsages = extractMediaAtoms(uuid, content, usageStatus, isReindex).zipWithIndex.map { case(atom, index) =>
      val usage = MediaUsage.build(AtomWrapper(index, atom), contentWrapper)
      createUsagesLogging(usage)
    }
    val imageElementUsages = extractImageElements(uuid, content, usageStatus, isReindex).zipWithIndex.map { case (element, index) => {
      val usage = MediaUsage.build(ElementWrapper(index, element), contentWrapper)
      createUsagesLogging(usage)
    }
    }

    mediaAtomsUsages ++ imageElementUsages
  }

  private def createUsagesLogging(usage: MediaUsage) = {
    Logger.info(s"Built MediaUsage for ${usage.mediaId}")

    usage.digitalUsageMetadata.map(meta => {
      Logger.info(s"MediaUsage for ${usage.mediaId}: ${Json.toJson(meta)}")
    })

    usage.printUsageMetadata.map(meta => {
      Logger.info(s"MediaUsage for ${usage.mediaId}: ${Json.toJson(meta)}")
    })
    usage
  }

  private def isNewContent(content: Content, usageStatus: UsageStatus): Boolean = {
    val dateLimit = new DateTime(Config.usageDateLimit)
    val contentFirstPublished = LiveContentApi.getContentFirstPublished(content)
    usageStatus match {
      case _: PublishedUsageStatus => contentFirstPublished
        .map(_.isAfter(dateLimit)).getOrElse(false)
      case _ => true
    }
  }

  private def extractMediaAtoms(uuid: String, content: Content, usageStatus: UsageStatus, isReindex: Boolean) = {
    val isNew = isNewContent(content, usageStatus)
    val shouldRecordUsages = isNew || isReindex

    if (shouldRecordUsages) {
      Logger.info(s"Passed shouldRecordUsages for media atom (job-${uuid})")
      val groupedMediaAtoms = groupMediaAtoms(content)

      if (groupedMediaAtoms.isEmpty) {
        Logger.info(s"No Matching media atoms found (job-${uuid})")
      } else {
        Logger.info(s"${groupedMediaAtoms.length} media atoms found (job-${uuid})")
        groupedMediaAtoms.map(atom => Logger.info(s"Matching media atom ${atom.id} found (job-${uuid})"))
      }

      groupedMediaAtoms
    } else {
      Logger.info(s"Failed shouldRecordUsages for media atoms: isNew-${isNew} isReindex-${isReindex} (job-${uuid})")
      Seq.empty
    }
  }

  private def groupMediaAtoms(content: Content) = {
    val mediaAtoms = content.atoms match {
      case Some(atoms) => {
        atoms.media match {
          case Some(mediaAtoms) => mediaAtoms.collect { case atom: MediaAtom => atom }
          case _ => Seq.empty
        }
      }
      case _ => Seq.empty
    }
    mediaAtoms
  }

  private def extractImageElements(uuid: String, content: Content, usageStatus: UsageStatus, isReindex: Boolean): Seq[Element] = {
    val isNew = isNewContent(content, usageStatus)
    val shouldRecordUsages = isNew || isReindex

    if (shouldRecordUsages) {
      Logger.info(s"Passed shouldRecordUsages (job-${uuid})")
      val groupedElements = groupImageElements(content)

      if (groupedElements.isEmpty) {
        Logger.info(s"No Matching elements found (job-${uuid})")
      } else {
        groupedElements.map(elements => {
          Logger.info(s"${elements.length} elements found (job-${uuid})")
          elements.map(element => Logger.info(s"Matching element ${element.id} found (job-${uuid})"))
        })
      }

      groupedElements.getOrElse(Seq.empty)
    } else {
      Logger.info(s"Failed shouldRecordUsages: isNew-${isNew} isReindex-${isReindex} (job-${uuid})")
      Seq.empty
    }
  }

  private def groupImageElements(content: Content): Option[Seq[Element]] = {
    content.elements.map(elements => {
      elements.filter(_.`type` == ElementType.Image)
        .groupBy(_.id)
        .map(_._2.head).to[collection.immutable.Seq]
    })
  }
}

case class ElementWrapper(index: Int, media: Element)
case class AtomWrapper(index: Int, media: Atom)
