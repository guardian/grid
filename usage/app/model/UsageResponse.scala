package model

import play.api.libs.json._
import org.joda.time.DateTime
import com.gu.mediaservice.model.DateFormat
import com.gu.mediaservice.lib.argo.ArgoHelpers


case class UsageResponse (
  mediaId: String,
  title: String,
  source: Map[String, MediaSource],
  usageType: String,
  mediaType: String,
  status: String,
  dateAdded: Option[DateTime],
  dateRemoved: Option[DateTime],
  lastModified: DateTime)


object UsageResponse extends ArgoHelpers {
  def respondUsageCollection(usages: Set[MediaUsage]) = {
    val flatUsages = usages.groupBy(_.grouping).flatMap { case (grouping, groupedUsages) => {
      val publishedUsage = groupedUsages.find(_.status match {
        case _: PublishedUsageStatus => true
        case _ => false
      })

      val mergedUsages = if (publishedUsage.isEmpty) {
          groupedUsages.headOption
        } else {
          publishedUsage
        }

      mergedUsages.filter(usage => (for {
        added <- usage.dateAdded
        removed <- usage.dateRemoved
      } yield added.isAfter(removed)).getOrElse(true))

    }}.toList

    respondCollections[UsageResponse](
      data = flatUsages.map(UsageResponse.build).groupBy(_.status.toString))
  }

  def buildCollectionResponse(usages: Set[MediaUsage]) = if(usages.isEmpty) {
    respondNotFound("No usages found.")
  } else {
    respondUsageCollection(usages)
  }

  def build (usage: MediaUsage): UsageResponse = {
    usage.usageType match {
      case "web" => UsageResponse(
        usage.mediaId,
        usage.data.getOrElse("webTitle", "No title specified."),
        MediaSource.build(usage),
        usage.usageType,
        usage.mediaType,
        usage.status.toString,
        usage.dateAdded,
        usage.dateRemoved,
        usage.lastModified
      )
      case "print" => {
        val title = List(
          usage.data.get("issueDate").map(date => new DateTime(date).toString("YYYY-MM-dd")),
          usage.data.get("pageNumber").map(page => s"Page $page"),
          usage.data.get("edition").map(edition => s"${intToOrdinalString(edition.toInt)} edition")
        )

        UsageResponse(
          usage.mediaId,
          title.flatten.mkString(", "),
          MediaSource.build(usage),
          usage.usageType,
          usage.mediaType,
          usage.status.toString,
          usage.dateAdded,
          usage.dateRemoved,
          usage.lastModified
        )
      }
    }
  }
  implicit val dateTimeFormat = DateFormat
  implicit val writes: Writes[UsageResponse] = Json.writes[UsageResponse]

  def intToOrdinalString (int: Int): String = {
    val ordinal = int % 10 match {
      case 1 => "st"
      case 2 => "nd"
      case 3 => "rd"
      case _ => "th"
    }
    s"$int$ordinal"
  }
}

case class MediaSource (
  uri: Option[String],
  name: Option[String] = None
)

object MediaSource {
  def build (usage: MediaUsage): Map[String, MediaSource] = {
    Map("frontend" -> MediaSource(usage.data.get("webUrl"), usage.data.get("webTitle"))) ++
      usage.data.get("composerUrl")
        .map(composerUrl => "composer" -> MediaSource(Some(composerUrl)))
  }

  implicit val writes: Writes[MediaSource] = Json.writes[MediaSource]
}


