import com.gu.mediaservice.lib.play.GridComponents
import controllers.{HealthCheck, ThrallController}
import lib._
import play.api.ApplicationLoader.Context
import router.Routes

class ThrallComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new ThrallConfig(configuration)

  val store = new ThrallStore(config)
  val dynamoNotifications = new DynamoNotifications(config)
  val thrallMetrics = new ThrallMetrics(config)

  val es1 = new ElasticSearch(config, thrallMetrics)
  es1.ensureAliasAssigned()

  val es6 = new ElasticSearch6(config, thrallMetrics)
  es6.ensureAliasAssigned()

  val es = new ElasticSearchRouter(es1, es6)

  val syndicationOps = new SyndicationRightsOps(es)

  val thrallMessageConsumer = new ThrallMessageConsumer(config, es, thrallMetrics, store, dynamoNotifications, syndicationOps)
  
  thrallMessageConsumer.startSchedule()
  context.lifecycle.addStopHook {
    () => thrallMessageConsumer.actorSystem.terminate()
  }

  val thrallController = new ThrallController(controllerComponents)
  val healthCheckController = new HealthCheck(es1, thrallMessageConsumer, config, controllerComponents) // TODO extract es health check

  override lazy val router = new Routes(httpErrorHandler, thrallController, healthCheckController, management)
}
