package lib

import com.amazonaws.services.cloudwatch.model.Dimension
import com.gu.mediaservice.lib.auth.{ApiKey, Syndication}
import com.gu.mediaservice.lib.auth.Syndication
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class MediaApiMetrics(config: MediaApiConfig) extends CloudWatchMetrics(s"${config.stage}/MediaApi", config) {

  val searchQueries = new TimeMetric("ElasticSearch")

  def searchTypeDimension(value: String): Dimension =
    new Dimension().withName("SearchType").withValue(value)

  def incrementOriginalImageDownload(apiKey: ApiKey) = {
    val metric = new CountMetric(apiKey.tier.toString)

    // CW Metrics have a maximum of 10 dimensions per metric.
    // Create a separate dimension per syndication partner and group other Tier types together.
    val dimensionValue: String = apiKey.tier match {
      case Syndication => apiKey.name
      case _ => apiKey.tier.toString
    }

    val dimension = new Dimension().withName("OriginalImageDownload").withValue(dimensionValue)

    metric.increment(List(dimension)).run
  }
}
