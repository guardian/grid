package lib

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

class ImageLoaderMetrics(config: ImageLoaderConfig, actorSystem: ActorSystem)
    extends CloudWatchMetrics (namespace = s"${config.stage}/ImageLoader", config, actorSystem){

  val successfulIngestsFromQueue = new CountMetric("SuccessfulIngestsFromQueue")

  val failedIngestsFromQueue = new CountMetric("FailedIngestsFromQueue")

  val abandonedMessagesFromQueue = new CountMetric("AbandonedMessagesFromQueue")
}
