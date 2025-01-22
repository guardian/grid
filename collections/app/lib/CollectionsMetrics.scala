package lib

import org.apache.pekko.actor.ActorSystem
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import play.api.inject.ApplicationLifecycle

import scala.concurrent.ExecutionContext

class CollectionsMetrics(
  config: CollectionsConfig,
  actorSystem: ActorSystem,
  applicationLifecycle: ApplicationLifecycle
)(implicit ec: ExecutionContext)
  extends CloudWatchMetrics(s"${config.stage}/Collections", config, actorSystem, applicationLifecycle) {

  val processingLatency = new TimeMetric("ProcessingLatency")

}
