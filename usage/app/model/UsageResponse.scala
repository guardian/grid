package model

import play.api.libs.json._
import org.joda.time.DateTime
import com.gu.mediaservice.model.DateFormat
import com.gu.mediaservice.lib.argo.ArgoHelpers


case class UsageResponse(
  mediaId: String,
  title: String,
  source: Map[String, UsageSource],
  usageType: String,
  mediaType: String,
  status: String,
  dateAdded: Option[DateTime],
  dateRemoved: Option[DateTime],
  lastModified: DateTime
)
object UsageResponse extends ArgoHelpers {
  import com.gu.mediaservice.lib.IntUtils._

  implicit val writes: Writes[UsageResponse] = Json.writes[UsageResponse]

  def build(usage: MediaUsage): UsageResponse = {
    usage.usageType match {
      case "web" => buildWeb(usage)
      case "print" => buildPrint(usage)
    }
  }

  private def buildWeb(usage: MediaUsage): UsageResponse = {
    UsageResponse(
      usage.mediaId,
      usage.data.getOrElse("webTitle", "No title specified."),
      UsageSource.build(usage),
      usage.usageType,
      usage.mediaType,
      usage.status.toString,
      usage.dateAdded,
      usage.dateRemoved,
      usage.lastModified
    )
  }

  private def buildPrint(usage: MediaUsage): UsageResponse = {
    val usageTitle = List(
      usage.data.get("issueDate").map(date => new DateTime(date).toString("YYYY-MM-dd")),
      usage.data.get("pageNumber").map(page => s"Page $page"),
      usage.data.get("edition").map(edition => s"${edition.toInt.toOrdinal} edition")
    ).flatten.mkString(", ")

    UsageResponse(
      usage.mediaId,
      usageTitle,
      UsageSource.build(usage),
      usage.usageType,
      usage.mediaType,
      usage.status.toString,
      usage.dateAdded,
      usage.dateRemoved,
      usage.lastModified
    )
  }
}
