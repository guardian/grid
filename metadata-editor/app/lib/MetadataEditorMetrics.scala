package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import lib.Config.{awsCredentials,stage}

object MetadataEditorMetrics extends CloudWatchMetrics(s"$stage/MetadataEditor", awsCredentials) {

  val processingLatency = new TimeMetric("ProcessingLatency")

}
