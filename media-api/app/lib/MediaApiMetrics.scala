package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

object MediaApiMetrics extends CloudWatchMetrics("MediaService/MediaApi", Config.awsCredentials) {

  val searchQueries = new TimeMetric("ElasticSearch", Seq("QueryType" -> "Search"))

}
