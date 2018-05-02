package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class UsageMetrics(config: UsageConfig) extends CloudWatchMetrics(s"${config.stage}/Usage", config) {
  def incrementUpdated = updates.increment().run
  def incrementErrors = errors.increment().run

  val updates = new CountMetric("UsageUpdates")
  val errors = new CountMetric("UsageUpdateErrors")
}
