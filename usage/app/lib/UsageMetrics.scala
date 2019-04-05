package lib

import com.amazonaws.services.cloudwatch.AmazonCloudWatch
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class UsageMetrics(namespace: String, client: AmazonCloudWatch) extends CloudWatchMetrics(s"$namespace/Usage", client) {
  def incrementUpdated = updates.increment().run
  def incrementErrors = errors.increment().run

  val updates = new CountMetric("UsageUpdates")
  val errors = new CountMetric("UsageUpdateErrors")
}
