package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import lib.Config.{awsCredentials,stage}

object CollectionsMetrics extends CloudWatchMetrics(s"$stage/Collections", awsCredentials) {

  val processingLatency = new TimeMetric("ProcessingLatency")

}
