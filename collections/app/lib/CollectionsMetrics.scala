package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class CollectionsMetrics(config: CollectionsConfig) extends CloudWatchMetrics(s"${config.stage}/Collections", config.awsCredentials) {

  val processingLatency = new TimeMetric("ProcessingLatency")

}
