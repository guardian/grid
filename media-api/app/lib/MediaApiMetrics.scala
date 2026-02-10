package lib

import com.gu.mediaservice.lib.auth.{ApiAccessor, Syndication}
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import org.apache.pekko.actor.ActorSystem
import play.api.inject.ApplicationLifecycle
import software.amazon.awssdk.services.cloudwatch.model.Dimension

import scala.concurrent.ExecutionContext

class MediaApiMetrics(config: MediaApiConfig, actorSystem: ActorSystem, applicationLifecycle: ApplicationLifecycle)(implicit ec: ExecutionContext)
  extends CloudWatchMetrics(s"${config.stage}/MediaApi", config, actorSystem, applicationLifecycle) {

  val searchQueries = new TimeMetric("ElasticSearch")

  def searchTypeDimension(value: String): Dimension =
    Dimension.builder().name("SearchType").value(value).build()

  sealed trait DownloadType {
    val metricName: String
  }
  case object OriginalDownloadType extends DownloadType {
    val metricName = "OriginalImageDownload"
  }
  case object OptimisedDownloadType extends DownloadType {
    val metricName = "OptimisedImageDownload"
  }

  def incrementImageDownload(apiKey: ApiAccessor, downloadType: DownloadType) = {
    val metric = new CountMetric(apiKey.tier.toString)

    // CW Metrics have a maximum of 10 dimensions per metric.
    // Create a separate dimension per syndication partner and group other Tier types together.
    val dimensionValue: String = apiKey.tier match {
      case Syndication => apiKey.identity
      case _ => apiKey.tier.toString
    }

    val dimension = Dimension.builder().name(downloadType.metricName).value(dimensionValue).build()

    metric.increment(List(dimension))
  }
}
