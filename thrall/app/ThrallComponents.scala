
import java.util.concurrent.TimeUnit

import com.gu.mediaservice.lib.play.GridComponents
import controllers.{HealthCheck, ThrallController}
import lib._
import play.api.ApplicationLoader.Context
import router.Routes

import scala.concurrent.Future

class ThrallComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new ThrallConfig()

  val store = new ThrallStore(config)
  val dynamoNotifications = new DynamoNotifications(config)
  val thrallMetrics = new ThrallMetrics(config)

  val es = new ElasticSearch(config, thrallMetrics)
  es.ensureAliasAssigned()

  val syndicationOps = new SyndicationRightsOps(es)

  val thrallMessageConsumer = new ThrallMessageConsumer(config, es, thrallMetrics, store, dynamoNotifications, syndicationOps)
  
  thrallMessageConsumer.startSchedule()
  context.lifecycle.addStopHook { () => thrallMessageConsumer.terminate() }

  val thrallController = new ThrallController(controllerComponents)
  val healthCheckController = new HealthCheck(es, thrallMessageConsumer, config, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, thrallController, healthCheckController, management)
}
