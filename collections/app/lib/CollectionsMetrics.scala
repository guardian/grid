package lib

import com.amazonaws.services.cloudwatch.AmazonCloudWatch
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class CollectionsMetrics(namespace: String, client: AmazonCloudWatch) extends CloudWatchMetrics(s"$namespace/Collections", client) {

  val processingLatency = new TimeMetric("ProcessingLatency")

}
