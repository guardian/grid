package lib

import org.joda.time.DateTime
import com.gu.mediaservice.model.{Usage, UsageReference}

import model.{PublishedUsageStatus, MediaUsage, UsageTableFullKey}


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
    usage.lastModified
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

  private def buildPrintUsageReference(usage: MediaUsage) = List(
    UsageReference("indesign", usage.data.get("containerId"),
      Option(List(
        usage.data.get("issueDate").map(date => new DateTime(date).toString("YYYY-MM-dd")),
        usage.data.get("pageNumber").map(page => s"Page $page"),
        usage.data.get("edition").map(edition => s"${edition.toInt.toOrdinal} edition")
      ).flatten.mkString(", ")).filter(_.trim.nonEmpty)))

  private def buildWebUsageReference(usage: MediaUsage) = List(
    UsageReference("frontend", usage.data.get("webUrl"), usage.data.get("webTitle"))) ++
    usage.data.get("composerUrl").map(composerUrl => UsageReference("composer", Some(composerUrl)))

}
