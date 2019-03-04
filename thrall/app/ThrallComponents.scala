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

  val es1Opt: Option[ElasticSearchVersion] = es1Config.map { c =>
    Logger.info("Configuring ES1: " + c)
    val es1 = new ElasticSearch(c, thrallMetrics)
    es1.ensureAliasAssigned()
    es1
  }

  val es6: ElasticSearchVersion = es6Config.map { c =>
    Logger.info("Configuring ES6: " + c)
    val es6 = new ElasticSearch6(c, thrallMetrics)
    es6.ensureAliasAssigned()
    es6
  }.getOrElse {
    throw new RuntimeException("Elastic 6 is required; please configure it")
  }

  {
    val thrallMessageConsumer = new ThrallMessageConsumer(config, thrallMetrics, store, dynamoNotifications)
    thrallMessageConsumer.startSchedule()
    context.lifecycle.addStopHook {
      () => thrallMessageConsumer.actorSystem.terminate()
    }
    thrallMessageConsumer
  }

  val elasticsToUpdate = new ElasticSearchRouter(Seq(Some(es6), es1Opt).flatten)

  val thrallKinesisMessageConsumer = new kinesis.ThrallMessageConsumer(config, elasticsToUpdate, thrallMetrics,
    store, dynamoNotifications, new SyndicationRightsOps(elasticsToUpdate), config.from)
    thrallKinesisMessageConsumer.start()

  val thrallController = new ThrallController(controllerComponents)

  val messageConsumerForHealthCheck = thrallKinesisMessageConsumer
  val healthCheckController = new HealthCheck(es1Opt.get, messageConsumerForHealthCheck, config, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, thrallController, healthCheckController, management)
}
