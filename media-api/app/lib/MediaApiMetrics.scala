package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import Config.{awsCredentials, stage}

object MediaApiMetrics extends CloudWatchMetrics(s"$stage/MediaService/MediaApi", awsCredentials) {

  val searchQueries = new TimeMetric("ElasticSearch", Seq("QueryType" -> "Search"))

}
