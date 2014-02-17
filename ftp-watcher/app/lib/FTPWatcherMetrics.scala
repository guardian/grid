package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import lib.Config._
import com.amazonaws.services.cloudwatch.model.Dimension

object FTPWatcherMetrics extends CloudWatchMetrics(s"$stage/FTPWatcher", metricsAwsCredentials) {

  val uploadedImages = new CountMetric("UploadedImages")

  val failedUploads = new CountMetric("FailedUploads")

  def uploadedByDimension(value: String): Dimension =
    new Dimension().withName("UploadedBy").withValue(value)

  def causedByDimension(thrown: Throwable): Dimension =
    new Dimension().withName("CausedBy").withValue(thrown.getClass.getSimpleName)

}
