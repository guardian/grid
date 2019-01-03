import com.gu.mediaservice.lib.play.GridComponents
import controllers.{HealthCheck, ThrallController}
import lib._
import play.api.ApplicationLoader.Context
import play.api.Logger
import router.Routes

class ThrallComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new ThrallConfig(configuration)

  val store = new ThrallStore(config)
  val dynamoNotifications = new DynamoNotifications(config)
  val thrallMetrics = new ThrallMetrics(config)

  val es1Config = ElasticSearchConfig(
    writeAlias = config.writeAlias,
    host = config.elasticsearchHost,
    port = config.elasticsearchPort,
    cluster = config.elasticsearchCluster
  )

  Logger.info("Configuring ES1: " + es1Config)
  val es1 = new ElasticSearch(es1Config, thrallMetrics)
  es1.ensureAliasAssigned()

  val es6Config = ElasticSearch6Config(
    writeAlias = config.writeAlias,
    host = config.elasticsearch6Host,
    port = config.elasticsearch6Port,
    cluster = config.elasticsearch6Cluster,
    shards = config.elasticsearch6Shards,
    replicas = config.elasticsearch6Replicas
  )

  Logger.info("Configuring ES6: " + es6Config)
  val es6 = new ElasticSearch6(es6Config, thrallMetrics)
  es6.ensureAliasAssigned()

  val elasticSearches = Seq(es1, es6)
  val es = new ElasticSearchRouter(elasticSearches)

  val syndicationOps = new SyndicationRightsOps(es)

  val thrallMessageConsumer = new ThrallMessageConsumer(config, es, thrallMetrics, store, dynamoNotifications, syndicationOps)
  
  thrallMessageConsumer.startSchedule()
  context.lifecycle.addStopHook {
    () => thrallMessageConsumer.actorSystem.terminate()
  }

  val thrallController = new ThrallController(controllerComponents)
  val healthCheckController = new HealthCheck(es1, thrallMessageConsumer, config, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, thrallController, healthCheckController, management)
}
