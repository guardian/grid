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
  def buildCollection(usages: Set[MediaUsage]) = {
    val flatUsages = usages.groupBy(_.grouping).flatMap { case (grouping, groupedUsages) => {
      val publishedUsage = groupedUsages
        .filter(_.status match {
          case _: PublishedUsageStatus => true
          case _ => false
        }).headOption

        if (publishedUsage.isEmpty) {
          groupedUsages.headOption
        } else {
          publishedUsage
        }
    }}

    respondCollection(flatUsages.map(UsageResponse.build).toList)
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
  def build (usage: MediaUsage): MediaSource = {
    MediaSource(usage.data.get("webUrl"), usage.data.get("webTitle"))
  }

  implicit val writes: Writes[MediaSource] = Json.writes[MediaSource]
}


