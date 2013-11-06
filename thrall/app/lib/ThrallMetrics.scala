package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import Config.{awsCredentials, stage}

object ThrallMetrics extends CloudWatchMetrics(s"MediaService/$stage/Thrall", awsCredentials) {

  val indexedImages = new CountMetric("IndexedImages")

  val deletedImages = new CountMetric("DeletedImages")

  val conflicts = new CountMetric("ElasticSearch/Conflicts")

}
