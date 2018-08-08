import com.gu.mediaservice.lib.play.GridComponents
import controllers.{HealthCheck, ThrallController}
import lib._
import play.api.ApplicationLoader.Context
import router.Routes

class ThrallComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new ThrallConfig(configuration)

  val store = new ThrallStore(config)
  val notifications = new DynamoNotifications(config)
  val thrallMetrics = new ThrallMetrics(config)

  val es = new ElasticSearch(config, thrallMetrics)
  es.ensureAliasAssigned()

  val syndicationRightsOps = new SyndicationRightsOps(es)

  val thrallMessageConsumer = new ThrallMessageConsumer(config, es, thrallMetrics, store, notifications, syndicationRightsOps)
  
  thrallMessageConsumer.startSchedule()
  context.lifecycle.addStopHook {
    () => thrallMessageConsumer.actorSystem.terminate()
  }

  val thrallController = new ThrallController(controllerComponents)
  val healthCheckController = new HealthCheck(es, thrallMessageConsumer, config, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, thrallController, healthCheckController, management)
}
