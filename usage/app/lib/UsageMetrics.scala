package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import Config.{awsCredentials, stage}

object UsageMetrics extends CloudWatchMetrics(s"$stage/Usage", awsCredentials) {
  def incrementUpdated = updates.increment().run
  def incrementErrors = errors.increment().run

  val updates = new CountMetric("UsageUpdates")
  val errors = new CountMetric("UsageUpdateErrors")
}
