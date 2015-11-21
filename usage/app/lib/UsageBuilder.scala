package lib

import org.joda.time.DateTime
import com.gu.mediaservice.model.{Usage, UsageReference}

import model.MediaUsage

object UsageBuilder {
  import com.gu.mediaservice.lib.IntUtils._

  def build(usage: MediaUsage): Usage = {
    usage.usageType match {
      case "web" => buildWeb(usage)
      case "print" => buildPrint(usage)
    }
  }

  private def buildWeb(usage: MediaUsage): Usage = {
    Usage(
      buildUsageReference(usage),
      usage.usageType,
      usage.mediaType,
      usage.status.toString,
      usage.dateAdded,
      usage.dateRemoved,
      usage.lastModified
    )
  }

  private def buildPrint(usage: MediaUsage): Usage = {
    Usage(
      buildUsageReference(usage),
      usage.usageType,
      usage.mediaType,
      usage.status.toString,
      usage.dateAdded,
      usage.dateRemoved,
      usage.lastModified
    )
  }

  private def buildUsageReference(usage: MediaUsage): List[UsageReference] = {
    usage.usageType match {
      case "web" => buildWebUsageReference(usage)
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
