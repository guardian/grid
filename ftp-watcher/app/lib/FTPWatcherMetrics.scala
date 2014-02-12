package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import lib.Config._
import com.amazonaws.services.cloudwatch.model.Dimension

object FTPWatcherMetrics extends CloudWatchMetrics(s"$stage/FTPWatcher", metricsAwsCredentials) {

  val uploadedImages = new CountMetric("UploadedImages")

  val failedUploads = new CountMetric("FailedUploads")

  def uploadedBy(value: String): Dimension = new Dimension().withName("UploadedBy").withValue(value)

}
