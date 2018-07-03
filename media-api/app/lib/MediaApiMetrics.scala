package lib

import com.amazonaws.services.cloudwatch.model.Dimension
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class MediaApiMetrics(config: MediaApiConfig) extends CloudWatchMetrics(s"${config.stage}/MediaApi", config) {

  val searchQueries = new TimeMetric("ElasticSearch")

  def searchTypeDimension(value: String): Dimension =
    new Dimension().withName("SearchType").withValue(value)

}
