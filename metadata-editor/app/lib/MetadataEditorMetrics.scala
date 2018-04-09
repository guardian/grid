package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class MetadataEditorMetrics(config: EditsConfig) extends CloudWatchMetrics(s"${config.stage}/MetadataEditor", config) {

  val processingLatency = new TimeMetric("ProcessingLatency")

}
