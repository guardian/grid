package lib

import com.amazonaws.services.cloudwatch.AmazonCloudWatch
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class MetadataEditorMetrics(namespace: String, client: AmazonCloudWatch) extends CloudWatchMetrics(s"$namespace/MetadataEditor", client) {

  val processingLatency = new TimeMetric("ProcessingLatency")

}
