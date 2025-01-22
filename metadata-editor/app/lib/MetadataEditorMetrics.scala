package lib

import org.apache.pekko.actor.ActorSystem
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import play.api.inject.ApplicationLifecycle

import scala.concurrent.ExecutionContext

class MetadataEditorMetrics(
  config: EditsConfig,
  actorSystem: ActorSystem,
  applicationLifecycle: ApplicationLifecycle
)(implicit ec: ExecutionContext)
  extends CloudWatchMetrics(s"${config.stage}/MetadataEditor", config, actorSystem, applicationLifecycle) {

  val snsMessage = new CountMetric("SNSMessage")

}
