import akka.Done
import akka.stream.scaladsl.Source
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.KinesisClientLibConfiguration
import com.contxt.kinesis.{KinesisRecord, KinesisSource}
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{HealthCheck, ThrallController}
import lib._
import lib.elasticsearch._
import lib.kinesis.{KinesisConfig, ThrallEventConsumer}
import play.api.ApplicationLoader.Context
import router.Routes

import scala.concurrent.Future

class ThrallComponents(context: Context) extends GridComponents(context, new ThrallConfig(_)) {
  final override val buildInfo = utils.buildinfo.BuildInfo

  val store = new ThrallStore(config)
  val metadataEditorNotifications = new MetadataEditorNotifications(config)
  val thrallMetrics = new ThrallMetrics(config)

  val esConfig = ElasticSearchConfig(
    alias = config.writeAlias,
    url = config.elasticsearch6Url,
    cluster = config.elasticsearch6Cluster,
    shards = config.elasticsearch6Shards,
    replicas = config.elasticsearch6Replicas
  )

  val es = new ElasticSearch(esConfig, Some(thrallMetrics))
  es.ensureAliasAssigned()

  val highPriorityKinesisConfig: KinesisClientLibConfiguration = KinesisConfig.kinesisConfig(config.kinesisConfig)
  val lowPriorityKinesisConfig: KinesisClientLibConfiguration = KinesisConfig.kinesisConfig(config.kinesisLowPriorityConfig)

  val highPrioritySource: Source[KinesisRecord, Future[Done]] = KinesisSource(highPriorityKinesisConfig)
  val lowPrioritySource: Source[KinesisRecord, Future[Done]] = KinesisSource(lowPriorityKinesisConfig)

  val thrallEventConsumer = new ThrallEventConsumer(es, thrallMetrics, store, metadataEditorNotifications, new SyndicationRightsOps(es), actorSystem)
  val thrallStreamProcessor = new ThrallStreamProcessor(highPrioritySource, lowPrioritySource, thrallEventConsumer, actorSystem, materializer)

  val streamRunning: Future[Done] = thrallStreamProcessor.run()

  val thrallController = new ThrallController(controllerComponents)
  val healthCheckController = new HealthCheck(es, streamRunning.isCompleted, config, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, thrallController, healthCheckController, management)
}
