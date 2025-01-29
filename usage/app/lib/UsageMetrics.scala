package lib

import org.apache.pekko.actor.ActorSystem
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import play.api.inject.ApplicationLifecycle

import scala.concurrent.ExecutionContext

class UsageMetrics(config: UsageConfig, actorSystem: ActorSystem, applicationLifecycle: ApplicationLifecycle)(implicit ec: ExecutionContext)
  extends CloudWatchMetrics(s"${config.stage}/Usage", config, actorSystem, applicationLifecycle) {

  def incrementUpdated = updates.increment()
  def incrementErrors = errors.increment()

  val updates = new CountMetric("UsageUpdates")
  val errors = new CountMetric("UsageUpdateErrors")
}
