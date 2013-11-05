package lib

import com.gu.mediaservice.lib.metrics.Metrics


object ThrallMetrics extends Metrics {

  val namespace: String = "MediaService.Thrall"

  lazy val credentials = Config.awsCredentials

  val indexedImages = new CountMetric("IndexedImages")

  val deletedImages = new CountMetric("DeletedImages")

}
