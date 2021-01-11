package lib

import com.amazonaws.services.cloudwatch.model.Dimension
import com.gu.mediaservice.lib.auth.{ApiAccessor, Syndication}
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class MediaApiMetrics(config: MediaApiConfig) extends CloudWatchMetrics(s"${config.stage}/MediaApi", config) {

  val searchQueries = new TimeMetric("ElasticSearch")
  val sqsMessage = new CountMetric("SQSMessage")

  def searchTypeDimension(value: String): Dimension =
    new Dimension().withName("SearchType").withValue(value)

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

    val dimension = new Dimension().withName(downloadType.metricName).withValue(dimensionValue)

    metric.increment(List(dimension)).run
  }
}
