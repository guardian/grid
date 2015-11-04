package model

import play.api.libs.json._
import org.joda.time.DateTime
import com.gu.mediaservice.model.DateFormat
import com.gu.mediaservice.lib.argo.ArgoHelpers


case class UsageResponse(
  mediaId: String,
  source: MediaSource,
  usageType: String,
  mediaType: String,
  status: String,
  dateAdded: Option[DateTime],
  dateRemoved: Option[DateTime],
  lastModified: DateTime
)

object UsageResponse extends ArgoHelpers {
  def respondUsageCollection(usages: Set[MediaUsage]) = {
    val flatUsages = usages.groupBy(_.grouping).flatMap { case (grouping, groupedUsages) => {
      val publishedUsage = groupedUsages
        .filter(_.status match {
          case _: PublishedUsageStatus => true
          case _ => false
        })
        .headOption

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
    UsageResponse(
      usage.mediaId,
      MediaSource.build(usage),
      usage.usageType,
      usage.mediaType,
      usage.status.toString,
      usage.dateAdded,
      usage.dateRemoved,
      usage.lastModified
    )
  }
  implicit val dateTimeFormat = DateFormat
  implicit val writes: Writes[UsageResponse] = Json.writes[UsageResponse]
}

case class MediaSource (
  uri: Option[String],
  name: Option[String]
)

object MediaSource {
  def build (usage: MediaUsage): MediaSource = MediaSource(
    usage.data.get("webUrl").map(_.toString),
    usage.data.get("webTitle").map(_.toString)
  )

  implicit val writes: Writes[MediaSource] = Json.writes[MediaSource]
}


