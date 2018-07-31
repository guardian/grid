package model

import play.api.Logger
import play.api.libs.json._
import com.gu.contentapi.client.model.v1.{Content, Element, ElementType}
import com.gu.contentatom.thrift.{Atom, AtomData}
import com.gu.mediaservice.model.{DigitalUsageMetadata, PrintUsageRecord, PublishedUsageStatus, UsageStatus, FrontUsageRequest}
import lib.{UsageConfig, LiveContentApi, MD5, UsageMetadataBuilder}
import org.joda.time.DateTime

case class UsageGroup(
  usages: Set[MediaUsage],
  grouping: String,
  status: UsageStatus,
  lastModified: DateTime,
  isReindex: Boolean = false
)
class UsageGroupOps(config: UsageConfig, mediaUsageOps: MediaUsageOps, liveContentApi: LiveContentApi, mediaWrapperOps: MediaWrapperOps) {

  def buildId(contentWrapper: ContentWrapper) = contentWrapper.id
  def buildId(printUsage: PrintUsageRecord) = s"print/${MD5.hash(List(
    Some(printUsage.mediaId),
    Some(printUsage.printUsageMetadata.pageNumber),
    Some(printUsage.printUsageMetadata.sectionCode),
    Some(printUsage.printUsageMetadata.issueDate)
  ).flatten.map(_.toString).mkString("_"))}"

  def buildId(frontUsage: FrontUsageRequest) = s"front/${MD5.hash(List(
    Some(frontUsage.mediaId),
    Some(frontUsage.containerId)
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
        Set(mediaUsageOps.build(printUsageRecord, usageId, buildId(printUsageRecord))),
        usageId.toString,
        printUsageRecord.usageStatus,
        printUsageRecord.dateAdded
      )
    })

  def build(frontUsageRequest: FrontUsageRequest) = {

      val usageId = UsageId.build(frontUsageRequest)

      UsageGroup(
        Set(mediaUsageOps.build(frontUsageRequest, usageId, buildId(frontUsageRequest))),
        usageId.toString,
        frontUsageRequest.usageStatus,
        frontUsageRequest.dateAdded
      )
  }

  def createUsages(contentWrapper: ContentWrapper, isReindex: Boolean) = {
    // Generate unique UUID to track extract job
    val uuid = java.util.UUID.randomUUID.toString

    val content = contentWrapper.content
    val usageStatus = contentWrapper.status

    Logger.info(s"Extracting images (job-$uuid) from ${content.id}")

    val mediaAtomsUsages = extractMediaAtoms(uuid, content, usageStatus, isReindex).zipWithIndex.flatMap { case (atom, index) =>
      getImageId(atom) match {
        case Some(id) =>
          val mediaWrapper = mediaWrapperOps.build(index, id, contentWrapper, buildId(contentWrapper))
          val usage = mediaUsageOps.build(mediaWrapper)
          Seq(createUsagesLogging(usage))
        case None => Seq.empty
      }
    }
    val imageElementUsages = extractImageElements(uuid, content, usageStatus, isReindex).zipWithIndex.map { case (element, index) =>
      val mediaWrapper = mediaWrapperOps.build(index, element.id, contentWrapper, buildId(contentWrapper))
      val usage = mediaUsageOps.build(mediaWrapper)
      createUsagesLogging(usage)
    }

    mediaAtomsUsages ++ imageElementUsages
  }

  private def createUsagesLogging(usage: MediaUsage) = {
    Logger.info(s"Built MediaUsage for ${usage.mediaId}")

    usage.digitalUsageMetadata.foreach(meta => {
      Logger.info(s"MediaUsage for ${usage.mediaId}: ${Json.toJson(meta)}")
    })

    usage.printUsageMetadata.foreach(meta => {
      Logger.info(s"MediaUsage for ${usage.mediaId}: ${Json.toJson(meta)}")
    })
    usage
  }

  private def isNewContent(content: Content, usageStatus: UsageStatus): Boolean = {
    val dateLimit = new DateTime(config.usageDateLimit)
    val contentFirstPublished = liveContentApi.getContentFirstPublished(content)
    usageStatus match {
      case _: PublishedUsageStatus => contentFirstPublished.exists(_.isAfter(dateLimit))
      case _ => true
    }
  }

  private def extractMediaAtoms(uuid: String, content: Content, usageStatus: UsageStatus, isReindex: Boolean) = {
    val isNew = isNewContent(content, usageStatus)
    val shouldRecordUsages = isNew || isReindex

    if (shouldRecordUsages) {
      Logger.info(s"Passed shouldRecordUsages for media atom (job-$uuid)")
      val groupedMediaAtoms = groupMediaAtoms(content)

      if (groupedMediaAtoms.isEmpty) {
        Logger.info(s"No Matching media atoms found (job-$uuid)")
      } else {
        Logger.info(s"${groupedMediaAtoms.length} media atoms found (job-$uuid)")
        groupedMediaAtoms.foreach(atom => Logger.info(s"Matching media atom ${atom.id} found (job-$uuid)"))
      }

      groupedMediaAtoms
    } else {
      Logger.info(s"Failed shouldRecordUsages for media atoms: isNew-$isNew isReindex-$isReindex (job-$uuid)")
      Seq.empty
    }
  }

  private def groupMediaAtoms(content: Content) = {
    val mediaAtoms = content.atoms match {
      case Some(atoms) =>
        atoms.media match {
          case Some(mediaAtoms) => filterOutAtomsWithNoImage(mediaAtoms)
          case _ => Seq.empty
        }
      case _ => Seq.empty
    }
    mediaAtoms
  }

  private def filterOutAtomsWithNoImage(atoms: Seq[Atom]): Seq[Atom] = {
    for {
      atom <- atoms
      atomId = getImageId(atom)
      if atomId.isDefined
    } yield atom
  }

  private def getImageId(atom: Atom): Option[String] = {
    try {
      val posterImage = atom.data.asInstanceOf[AtomData.Media].media.posterImage
      posterImage match {
        case Some(image) => Some(image.mediaId.replace(s"${config.apiUri}/images/", ""))
        case _ => None
      }
    } catch {
      case e: ClassCastException => None
    }
  }

  private def extractImageElements(uuid: String, content: Content, usageStatus: UsageStatus, isReindex: Boolean): Seq[Element] = {
    val isNew = isNewContent(content, usageStatus)
    val shouldRecordUsages = isNew || isReindex

    if (shouldRecordUsages) {
      Logger.info(s"Passed shouldRecordUsages (job-$uuid)")
      val groupedElements = groupImageElements(content)

      if (groupedElements.isEmpty) {
        Logger.info(s"No Matching elements found (job-$uuid)")
      } else {
        groupedElements.foreach(elements => {
          Logger.info(s"${elements.length} elements found (job-$uuid)")
          elements.foreach(element => Logger.info(s"Matching element ${element.id} found (job-$uuid)"))
        })
      }

      groupedElements.getOrElse(Seq.empty)
    } else {
      Logger.info(s"Failed shouldRecordUsages: isNew-$isNew isReindex-$isReindex (job-$uuid)")
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

case class MediaWrapper(
    index: Int,
    mediaId: String,
    usageGroupId: String,
    contentStatus: UsageStatus,
    usageMetadata: DigitalUsageMetadata,
    lastModified: DateTime)

class MediaWrapperOps(usageMetadataBuilder: UsageMetadataBuilder) {
  def build(index: Int, mediaId: String, contentWrapper: ContentWrapper, usageGroupId: String): MediaWrapper = {
    val usageMetadata = usageMetadataBuilder.build(contentWrapper.content)
    MediaWrapper(index, mediaId, usageGroupId, contentWrapper.status, usageMetadata, contentWrapper.lastModified)
  }
}
