package lib

import com.amazonaws.services.cloudwatch.model.Dimension
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import Config.{awsCredentials, stage}

object MediaApiMetrics extends CloudWatchMetrics(s"$stage/MediaApi", awsCredentials) {

  val searchQueries = new TimeMetric("ElasticSearch")

  def searchTypeDimension(value: String): Dimension =
    new Dimension().withName("SearchType").withValue(value)

}
