package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import Config.{awsCredentials, stage}

object ThrallMetrics extends CloudWatchMetrics(s"$stage/Thrall", awsCredentials) {

  val indexedImages = new CountMetric("IndexedImages")

  val deletedImages = new CountMetric("DeletedImages")

  val failedDeletedImages = new CountMetric("FailedDeletedImages")

  val failedMetadataUpdates = new CountMetric("FailedMetadataUpdates")

  val failedExportsUpdates = new CountMetric("FailedExportsUpdates")

  val failedUsagesUpdates = new CountMetric("FailedUsagesUpdates")

  val failedQueryUpdates = new CountMetric("FailedQueryUpdates")

  val processingLatency = new TimeMetric("ProcessingLatency")

}
