package lib

import org.joda.time.DateTime
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage._
import model.{MediaUsage, UsageTableFullKey}

object UsageBuilder {
  import com.gu.mediaservice.lib.IntUtils._

  def build(usage: MediaUsage) = Usage(
    buildId(usage),
    buildUsageReference(usage),
    usage.usageType,
    usage.mediaType,
    buildStatusString(usage),
    usage.dateAdded,
    usage.dateRemoved,
    usage.lastModified,
    usage.printUsageMetadata,
    usage.digitalUsageMetadata
  )

  private def buildStatusString(usage: MediaUsage): UsageStatus = if (usage.isRemoved) RemovedUsageStatus else usage.status

  private def buildId(usage: MediaUsage): String = {
    UsageTableFullKey.build(usage).toString
  }

  private def buildUsageReference(usage: MediaUsage): List[UsageReference] = {
    usage.usageType match {
      case DigitalUsage => buildWebUsageReference(usage)
      case PrintUsage => buildPrintUsageReference(usage)
    }
  }

  private def buildPrintUsageReference(usage: MediaUsage):List[UsageReference] =
    usage.printUsageMetadata.map(metadata => {
      val title = List(
        new DateTime(metadata.issueDate).toString("YYYY-MM-dd"),
        metadata.publicationName,
        metadata.sectionName,
        s"Page ${metadata.pageNumber}"
      ).mkString(", ")

      List(UsageReference(InDesignUsageReference, None, Some(title)))

    }).getOrElse(List[UsageReference]())

  private def buildWebUsageReference(usage: MediaUsage): List[UsageReference] = usage.digitalUsageMetadata.map(metadata => {
    List(
      UsageReference(FrontendUsageReference, Some(metadata.webUrl), Some(metadata.webTitle))
    ) ++ metadata.composerUrl.map(url => UsageReference(ComposerUsageReference, Some(url)))
  }).getOrElse(
    List[UsageReference]()
  )
}
