import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import com.gu.mediaservice.lib.elasticsearch6.ElasticSearch6Config
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{HealthCheck, ThrallController}
import lib._
import play.api.ApplicationLoader.Context
import play.api.Logger
import router.Routes

class ThrallComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new ThrallConfig(configuration)

  val store = new ThrallStore(config)
  val metadataEditorNotifications = new MetadataEditorNotifications(config)
  val thrallMetrics = new ThrallMetrics(config)

  val es1Config = ElasticSearchConfig(
    alias = config.writeAlias,
    host = config.elasticsearchHost,
    port = config.elasticsearchPort,
    cluster = config.elasticsearchCluster
  )

  val es6Config = ElasticSearch6Config(
    alias = config.writeAlias,
    url = config.elasticsearch6Url,
    cluster = config.elasticsearch6Cluster,
    shards = config.elasticsearch6Shards,
    replicas = config.elasticsearch6Replicas
  )

  val es1 = new ElasticSearch(es1Config, Some(thrallMetrics))
  val es6 = new ElasticSearch6(es6Config, Some(thrallMetrics))

  val messageConsumerForHealthCheck = new ThrallSqsMessageConsumer(config, es1, thrallMetrics, store, new SyndicationRightsOps(es1))

  messageConsumerForHealthCheck.startSchedule()

  context.lifecycle.addStopHook {
    () => messageConsumerForHealthCheck.actorSystem.terminate()
  }

  val thrallKinesisMessageConsumer = new kinesis.ThrallMessageConsumer(
    config, es6, thrallMetrics, store, metadataEditorNotifications, new SyndicationRightsOps(es6), config.from
  )
  thrallKinesisMessageConsumer.start()

  val thrallController = new ThrallController(controllerComponents)
  val healthCheckController = new HealthCheck(es1, messageConsumerForHealthCheck, config, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, thrallController, healthCheckController, management)
}
