package lib

import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class ImageLoaderMetrics(config: ImageLoaderConfig) extends CloudWatchMetrics (namespace = s"${config.stage}/ImageLoader", config){

  val successfulIngestsFromQueue = new CountMetric("SuccessfulIngestsFromQueue")

  val failedIngestsFromQueue = new CountMetric("FailedIngestsFromQueue")

  val abandonedMessagesFromQueue = new CountMetric("AbandonedMessagesFromQueue")

  val invalidMimeTypeUploaded = new CountMetric("invalidMimeTypeUploaded")
}
