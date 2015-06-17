package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import lib.Config._
import scalaz.concurrent.Task
import com.amazonaws.services.cloudwatch.model.Dimension

object FTPWatcherMetrics extends CloudWatchMetrics(s"$stage/FTPWatcher", metricsAwsCredentials) {

  def incrementUploaded(uploader: String) =  for {
    _ <- uploadedImages.increment(List(uploadedByDimension(uploader)))
    _ <- uploadedImages.increment()
  } yield ()

  val retrievingImages = new CountMetric("RetrievingImages")

  val retrievedImages = new CountMetric("RetrievedImages")

  val uploadedImages = new CountMetric("UploadedImages")

  val failedUploads = new CountMetric("FailedUploads")

  def uploadedByDimension(value: String): Dimension =
    new Dimension().withName("UploadedBy").withValue(value)

  def causedByDimension(thrown: Throwable): Dimension =
    new Dimension().withName("CausedBy").withValue(thrown.getClass.getSimpleName)

}
