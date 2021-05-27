import akka.Done
import akka.stream.scaladsl.Source
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.KinesisClientLibConfiguration
import com.contxt.kinesis.{KinesisRecord, KinesisSource}
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import com.gu.mediaservice.lib.management.InnerServiceStatusCheckController
import com.gu.mediaservice.lib.play.GridComponents
import com.typesafe.scalalogging.StrictLogging
import controllers.{HealthCheck, ThrallController}
import lib._
import lib.elasticsearch._
import lib.kinesis.{KinesisConfig, ThrallEventConsumer}
import play.api.ApplicationLoader.Context
import router.Routes

import scala.concurrent.duration._
import scala.concurrent.{Await, Future}
import scala.language.postfixOps
import scala.util.{Failure, Success}

class ThrallComponents(context: Context) extends GridComponents(context, new ThrallConfig(_)) with StrictLogging {
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

  // before firing up anything to consume streams or say we are OK let's do the critical good to go check
  private val goodToGoCheckResult = Await.ready(GoodToGoCheck.run(es), 30 seconds)
  goodToGoCheckResult.value match {
    case Some(Success(_)) => // all good
      logger.info("Passed good to go")
    case Some(Failure(exception)) =>
      logger.error("Failed good to go, aborting startup", exception)
      throw exception
    case other =>
      logger.warn(s"Result of good to go was $other, aborting as this result doesn't make sense")
      throw new IllegalStateException("Good to go test didn't pass or throw exception")
  }

  val highPriorityKinesisConfig: KinesisClientLibConfiguration = KinesisConfig.kinesisConfig(config.kinesisConfig)
  val lowPriorityKinesisConfig: KinesisClientLibConfiguration = KinesisConfig.kinesisConfig(config.kinesisLowPriorityConfig)

  val highPrioritySource: Source[KinesisRecord, Future[Done]] = KinesisSource(highPriorityKinesisConfig)
  val lowPrioritySource: Source[KinesisRecord, Future[Done]] = KinesisSource(lowPriorityKinesisConfig)

  val thrallEventConsumer = new ThrallEventConsumer(es, thrallMetrics, store, metadataEditorNotifications, actorSystem)
  val thrallStreamProcessor = new ThrallStreamProcessor(highPrioritySource, lowPrioritySource, thrallEventConsumer, actorSystem, materializer)

  val streamRunning: Future[Done] = thrallStreamProcessor.run()

  val thrallController = new ThrallController(controllerComponents)
  val healthCheckController = new HealthCheck(es, streamRunning.isCompleted, config, controllerComponents)
  val InnerServiceStatusCheckController = new InnerServiceStatusCheckController(auth, controllerComponents, config.services, wsClient)


  override lazy val router = new Routes(httpErrorHandler, thrallController, healthCheckController, management, InnerServiceStatusCheckController)
}
