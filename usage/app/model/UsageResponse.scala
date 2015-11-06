package model

import play.api.libs.json._
import org.joda.time.DateTime
import com.gu.mediaservice.model.DateFormat
import com.gu.mediaservice.lib.argo.ArgoHelpers

trait UsageResponse {
  val mediaId: String
  val title: String
  val source: Map[String, MediaSource]
  val usageType: String
  val mediaType: String
  val status: String
  val dateAdded: Option[DateTime]
  val dateRemoved: Option[DateTime]
  val lastModified: DateTime
}

case class WebUsageResponse(
  mediaId: String,
  title: String,
  source: Map[String, WebMediaSource],
  usageType: String,
  mediaType: String,
  status: String,
  dateAdded: Option[DateTime],
  dateRemoved: Option[DateTime],
  lastModified: DateTime) extends UsageResponse

object WebUsageResponse {
  def build(usage: MediaUsage): WebUsageResponse = {
    WebUsageResponse(
      usage.mediaId,
      usage.data.getOrElse("webTitle", "No title specified."),
      WebMediaSource.build(usage),
      usage.usageType,
      usage.mediaType,
      usage.status.toString,
      usage.dateAdded,
      usage.dateRemoved,
      usage.lastModified
    )
  }
}

case class PrintUsageResponse(
  mediaId: String,
  title: String,
  source: Map[String, PrintMediaSource],
  usageType: String,
  mediaType: String,
  status: String,
  dateAdded: Option[DateTime],
  dateRemoved: Option[DateTime],
  lastModified: DateTime) extends UsageResponse

object PrintUsageResponse {
  def intToOrdinalString (int: Int): String = {
    val ordinal = int % 10 match {
      case 1 => "st"
      case 2 => "nd"
      case 3 => "rd"
      case _ => "th"
    }
    s"$int$ordinal"
  }

  def build(usage: MediaUsage): PrintUsageResponse = {
    val title = List(
      usage.data.get("issueDate").map(date => new DateTime(date).toString("YYYY-MM-dd")),
      usage.data.get("pageNumber").map(page => s"Page $page"),
      usage.data.get("edition").map(edition => s"${intToOrdinalString(edition.toInt)} edition")
    )

    PrintUsageResponse(
      usage.mediaId,
      title.flatten.mkString(", "),
      PrintMediaSource.build(usage),
      usage.usageType,
      usage.mediaType,
      usage.status.toString,
      usage.dateAdded,
      usage.dateRemoved,
      usage.lastModified
    )
  }
}

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
      case "web" => WebUsageResponse.build(usage)
      case "print" => PrintUsageResponse.build(usage)
    }
  }
  implicit val dateTimeFormat = DateFormat
  implicit val writes: Writes[UsageResponse] = Json.writes[UsageResponse]
}

trait MediaSource {
  val uri: Option[String]
  val name: Option[String]

  implicit val writes: Writes[MediaSource] = Json.writes[MediaSource]
}

case class WebMediaSource (uri: Option[String],name: Option[String] = None) extends MediaSource
case class PrintMediaSource (uri: Option[String], name: Option[String]) extends MediaSource

object WebMediaSource {
  def build(usage: MediaUsage): Map[String, WebMediaSource] = {
    Map("frontend" -> WebMediaSource(usage.data.get("webUrl"), usage.data.get("webTitle"))) ++
      usage.data.get("composerUrl").map(
        composerUrl => "composer" -> WebMediaSource(Some(composerUrl))
      )
  }
}

object PrintMediaSource {
  def build(usage: MediaUsage): Map[String, PrintMediaSource] = {
    Map("indesign" -> PrintMediaSource(usage.data.get("containerId"), usage.data.get("storyName")))
  }
}

