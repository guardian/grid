package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics


object ThrallMetrics extends CloudWatchMetrics("MediaService/Thrall", Config.awsCredentials) {

  val indexedImages = new CountMetric("IndexedImages")

  val deletedImages = new CountMetric("DeletedImages")

}
