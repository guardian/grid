package lib

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

import scala.concurrent.ExecutionContext

class MetadataEditorMetrics(
  config: EditsConfig,
  actorSystem: ActorSystem
)(implicit ec: ExecutionContext)
  extends CloudWatchMetrics(s"${config.stage}/MetadataEditor", config, actorSystem) {

  val snsMessage = new CountMetric("SNSMessage")

}
