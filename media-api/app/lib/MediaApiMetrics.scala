package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import Config.{awsCredentials, stage}

object MediaApiMetrics extends CloudWatchMetrics(s"$stage/MediaApi", awsCredentials) {

  val searchQueries = new TimeMetric("ElasticSearch")

}
