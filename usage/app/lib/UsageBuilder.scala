package lib

import org.joda.time.DateTime
import com.gu.mediaservice.model.{Usage, UsageReference, PublishedUsageStatus}

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

  private def buildStatusString(usage: MediaUsage) = if (usage.status match {
    case _: PublishedUsageStatus => usage.isRemoved
    case _ => false
  }) "removed" else usage.status.toString

  private def buildId(usage: MediaUsage): String = {
    UsageTableFullKey.build(usage).toString
  }

  private def buildUsageReference(usage: MediaUsage): List[UsageReference] = {
    usage.usageType match {
      case "digital" => buildWebUsageReference(usage)
      case "print" => buildPrintUsageReference(usage)
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

      List(UsageReference("indesign", None, Some(title)))

    }).getOrElse(List[UsageReference]())

  private def buildWebUsageReference(usage: MediaUsage) =
    usage.digitalUsageMetadata.map(metadata => {
      List(
        UsageReference("frontend", Some(metadata.webUrl), Some(metadata.webTitle))
      ) ++ metadata.composerUrl.map(url => UsageReference("composer", Some(url)))

    }).getOrElse(List[UsageReference]())

}
