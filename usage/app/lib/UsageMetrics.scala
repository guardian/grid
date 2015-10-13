package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import Config.{awsCredentials, stage}

object UsageMetrics extends CloudWatchMetrics(s"$stage/Usage", awsCredentials) {
  val usageUpdates = new CountMetric("UsageUpdates")
  val usageUpdateErrors = new CountMetric("UsageUpdateErrors")
}
