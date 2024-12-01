import org.apache.pekko.Done
import org.apache.pekko.stream.scaladsl.Source
import com.gu.kinesis.{KinesisRecord, KinesisSource, ConsumerConfig => KclPekkoStreamConfig}
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.aws.{S3Ops, ThrallMessageSender}
import com.gu.mediaservice.lib.instances.{Instances, InstancesClient}
import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.lib.metadata.SoftDeletedMetadataTable
import com.gu.mediaservice.lib.play.GridComponents
import com.typesafe.scalalogging.StrictLogging
import controllers.{AssetsComponents, HealthCheck, ReaperController, ThrallController}
import instances.{InstanceMessageSender, InstanceUsageMessage}
import lib._
import lib.elasticsearch._
import lib.kinesis.{KinesisConfig, ThrallEventConsumer}
import play.api.ApplicationLoader.Context
import router.Routes
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest

import scala.concurrent.{Await, Future}
import scala.concurrent.duration._
import scala.language.postfixOps
import com.gu.mediaservice.lib.aws.S3

class ThrallComponents(context: Context) extends GridComponents(context, new ThrallConfig(_)) with StrictLogging with AssetsComponents
  with Instances {
  final override val buildInfo = utils.buildinfo.BuildInfo

  val store = new ThrallStore(config)
  val metadataEditorNotifications = new MetadataEditorNotifications(config)
  val thrallMetrics = new ThrallMetrics(config, actorSystem, applicationLifecycle)

  val es = new ElasticSearch(config.esConfig, Some(thrallMetrics), actorSystem.scheduler, new InstancesClient(config, wsClient))

  val gridClient: GridClient = GridClient(config.services)(wsClient)

   val sqsClient: SqsClient = SqsClient.builder()
    .region(Region.EU_WEST_1)
    .build()

   val instanceUsageQueueUrl: String = {
    val getQueueRequest = GetQueueUrlRequest.builder()
      .queueName(config.instanceUsageQueueName)
      .build()
    sqsClient.getQueueUrl(getQueueRequest).queueUrl
  }

  private val instanceMessageSender = new InstanceMessageSender(sqsClient, instanceUsageQueueUrl)

  // before firing up anything to consume streams or say we are OK let's do the critical good to go check
  def ensureIndexes(): Future[Unit] = {
    logger.info("Ensuring indexes")
    getInstances().map { instances =>
      instances.foreach{ instance =>
        logger.info("Ensuing index for: " + instance.id)
        es.ensureIndexExistsAndAliasAssigned(alias = es.imagesCurrentAlias(instance), index = instance.id + "_index")
      }
    }
  }
  Await.ready(ensureIndexes(), 60 seconds)

  val messageSender = new ThrallMessageSender(config.thrallKinesisStreamConfig)

  val highPriorityKinesisConfig: KclPekkoStreamConfig = KinesisConfig.kinesisConfig(config.kinesisConfig)
  val lowPriorityKinesisConfig: KclPekkoStreamConfig = KinesisConfig.kinesisConfig(config.kinesisLowPriorityConfig)

  val uiSource: Source[KinesisRecord, Future[Done]] = KinesisSource(highPriorityKinesisConfig)
  val automationSource: Source[KinesisRecord, Future[Done]] = KinesisSource(lowPriorityKinesisConfig)
  val migrationSourceWithSender: MigrationSourceWithSender = new MigrationSourceWithSenderFactory(materializer, auth.innerServiceCall, es, gridClient, config.projectionParallelism, new InstancesClient(config, wsClient)).build()

  val thrallEventConsumer = new ThrallEventConsumer(
    es,
    thrallMetrics,
    store,
    metadataEditorNotifications,
    actorSystem,
    gridClient,
    auth,
    instanceMessageSender,
    events
  )

  val thrallStreamProcessor = new ThrallStreamProcessor(
    uiSource,
    automationSource,
    migrationSourceWithSender.source,
    thrallEventConsumer,
    actorSystem
  )

  val streamRunning: Future[Done] = thrallStreamProcessor.run()

  val s3 = new S3(config)

  Source.repeat(()).throttle(1, per = 5.minute).map(_ => {
    implicit val logMarker: MarkerMap = MarkerMap()
    getInstances().map { instances =>
      // Foreach instance; query elastic for number image and total file size
      instances.foreach { instance =>
        logger.info("Checking usage for: " + instance)
        implicit val i = instance
        val eventualImagesCount = es.countTotal(isSoftedDeleted = false)
        val eventualSoftDeletedCount = es.countTotal(isSoftedDeleted = true)
        val eventualTotalImageSize = es.countTotalImageSize()
        for {
          imageCount <- eventualImagesCount
          softDeletedCount <- eventualSoftDeletedCount
          totalImageSize <- eventualTotalImageSize
        } yield {
          logger.info(s"Instance ${instance.id} has $imageCount/$softDeletedCount images with total size: " + totalImageSize)
          instanceMessageSender.send(InstanceUsageMessage(instance = instance.id, imageCount = imageCount, softDeletedCount = softDeletedCount, totalImageSize = totalImageSize))
        }
      }
    }
    // TODO Block?

  }).run()


  val softDeletedMetadataTable = new SoftDeletedMetadataTable(config)
  val maybeCustomReapableEligibility = config.maybeReapableEligibilityClass(applicationLifecycle)

  val thrallController = new ThrallController(es, store, migrationSourceWithSender.send, messageSender, actorSystem, auth, config.services, controllerComponents, gridClient, s3, config.imageBucket)
  val reaperController = new ReaperController(es, store, authorisation, config, actorSystem.scheduler, maybeCustomReapableEligibility, softDeletedMetadataTable, thrallMetrics, auth, config.services, controllerComponents, wsClient, events)
  val healthCheckController = new HealthCheck(es, streamRunning.isCompleted, config, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, thrallController, reaperController, healthCheckController, management, assets)
}
