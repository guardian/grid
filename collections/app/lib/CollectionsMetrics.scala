package lib

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

import scala.concurrent.ExecutionContext

class CollectionsMetrics(
  config: CollectionsConfig,
  actorSystem: ActorSystem
)(implicit ec: ExecutionContext)
  extends CloudWatchMetrics(s"${config.stage}/Collections", config, actorSystem) {

  val processingLatency = new TimeMetric("ProcessingLatency")

}
