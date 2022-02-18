package lib

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics

import scala.concurrent.ExecutionContext

class UsageMetrics(config: UsageConfig, actorSystem: ActorSystem)(implicit ec: ExecutionContext)
  extends CloudWatchMetrics(s"${config.stage}/Usage", config, actorSystem) {

  def incrementUpdated = updates.increment()
  def incrementErrors = errors.increment()

  val updates = new CountMetric("UsageUpdates")
  val errors = new CountMetric("UsageUpdateErrors")
}
