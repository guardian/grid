package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class MetadataEditorMetrics(config: EditsConfig) extends CloudWatchMetrics(s"${config.stage}/MetadataEditor", config) {

  val snsMessage = new CountMetric("SNSMessage")

}
