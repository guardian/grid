package lib

import org.apache.pekko.actor.ActorSystem
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import play.api.inject.ApplicationLifecycle

class ImageLoaderMetrics(config: ImageLoaderConfig, actorSystem: ActorSystem, applicationLifecycle: ApplicationLifecycle)
    extends CloudWatchMetrics (namespace = s"${config.stage}/ImageLoader", config, actorSystem, applicationLifecycle){

  val successfulIngestsFromQueue = new CountMetric("SuccessfulIngestsFromQueue")

  val failedIngestsFromQueue = new CountMetric("FailedIngestsFromQueue")

  val abandonedMessagesFromQueue = new CountMetric("AbandonedMessagesFromQueue")
}
