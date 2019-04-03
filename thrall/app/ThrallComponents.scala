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
  val dynamoNotifications = new MetadataNotifications(config)
  val thrallMetrics = new ThrallMetrics(config)

  val es1Config = for {
    h <- config.elasticsearchHost
    p <- config.elasticsearchPort
    c <- config.elasticsearchCluster
  } yield {
    ElasticSearchConfig(
      alias = config.writeAlias,
      host = h,
      port = p,
      cluster = c
    )
  }

  val es6Config =
    for {
      h <- config.elasticsearch6Host
      p <- config.elasticsearch6Port
      c <- config.elasticsearch6Cluster
      s <- config.elasticsearch6Shards
      r <- config.elasticsearch6Replicas
    } yield {
      ElasticSearch6Config(
        alias = config.writeAlias,
        host = h,
        port = p,
        cluster = c,
        shards = s,
        replicas = r
      )
  }

  val es1Opt = es1Config.map { c =>
    Logger.info("Configuring ES1: " + c)
    val es1 = new ElasticSearch(c, thrallMetrics)
    es1.ensureAliasAssigned()
    es1
  }

  val es6pot = es6Config.map { c =>
    Logger.info("Configuring ES6: " + c)
    val es6 = new ElasticSearch6(c, thrallMetrics)
    es6.ensureAliasAssigned()
    es6
  }

  es1Opt.map { es1 =>
    val thrallMessageConsumer = new ThrallMessageConsumer(config, es1, thrallMetrics, store, dynamoNotifications, new SyndicationRightsOps(es1))
    thrallMessageConsumer.startSchedule()
    context.lifecycle.addStopHook {
      () => thrallMessageConsumer.actorSystem.terminate()
    }
  }

  var messageConsumerForHealthCheck = es6pot.map { es6 =>
    val thrallKinesisMessageConsumer = new kinesis.ThrallMessageConsumer(config, es6, thrallMetrics,
      store, dynamoNotifications, new SyndicationRightsOps(es6), config.from)
    thrallKinesisMessageConsumer.start()
    thrallKinesisMessageConsumer
  }.get

  val thrallController = new ThrallController(controllerComponents)
  val healthCheckController = new HealthCheck(es1Opt.get, messageConsumerForHealthCheck, config, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, thrallController, healthCheckController, management)
}
