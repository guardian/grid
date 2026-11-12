package lib

import com.gu.mediaservice.lib.logging.GridLogging
import model.UsageGroupOps
import software.amazon.awssdk.auth.credentials.{AwsCredentialsProviderChain, DefaultCredentialsProvider, ProfileCredentialsProvider}
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cloudwatch.CloudWatchAsyncClient
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient
import software.amazon.awssdk.services.kinesis.KinesisAsyncClient
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.auth.StsAssumeRoleCredentialsProvider
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest
import software.amazon.kinesis.common.{ConfigsBuilder, InitialPositionInStream, InitialPositionInStreamExtended, KinesisClientUtil}
import software.amazon.kinesis.coordinator.CoordinatorConfig.ClientVersionConfig
import software.amazon.kinesis.coordinator.Scheduler
import software.amazon.kinesis.processor.{ShardRecordProcessor, ShardRecordProcessorFactory}
import software.amazon.kinesis.retrieval.polling.PollingConfig

import java.net.InetAddress
import java.util.UUID
import scala.annotation.nowarn
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.FutureConverters._
import scala.util.Try

// it's annoyingly hard to get the streamName out of the configsBuilder once built, so pass them around together
private case class ConfigsBuilderWithStreamName(configsBuilder: ConfigsBuilder, streamName: String)

class CrierStreamReader(
  config: UsageConfig,
  usageGroupOps: UsageGroupOps,
  usageGroupStream: UsageGroupStream,
  executionContext: ExecutionContext
) extends GridLogging {

  private val region = Region.of(config.awsRegionName)

  private lazy val workerId: String = InetAddress.getLocalHost.getCanonicalHostName + ":" + UUID.randomUUID()

  private lazy val awsCredentialsProvider = DefaultCredentialsProvider.builder().profileName("media-service").build()
  private lazy val stsClient = StsClient.builder().region(region).credentialsProvider(awsCredentialsProvider).build()

  private lazy val sessionId: String = "session-" + Math.random()
  private val initialPosition = InitialPositionInStreamExtended.newInitialPosition(InitialPositionInStream.TRIM_HORIZON)

  private def kinesisCredentialsProvider(arn: String): AwsCredentialsProviderChain = {
    val assumeRoleRequest = AssumeRoleRequest.builder().roleArn(arn).roleSessionName(sessionId).build()

    AwsCredentialsProviderChain.of(
      ProfileCredentialsProvider.create("capi"),
      StsAssumeRoleCredentialsProvider.builder().refreshRequest(assumeRoleRequest).stsClient(stsClient).build()
    )
  }

  private def kinesisClientLibConfig(processorFactory: ShardRecordProcessorFactory)
    (kinesisReaderConfig: KinesisReaderConfig): ConfigsBuilderWithStreamName = {

    val kinesisClient = KinesisClientUtil.createKinesisAsyncClient(KinesisAsyncClient.builder()
      .region(region)
      .credentialsProvider(kinesisCredentialsProvider(kinesisReaderConfig.arn)))
    val dynamoClient = DynamoDbAsyncClient.builder()
      .region(region)
      .credentialsProvider(awsCredentialsProvider)
      .build()
    val cloudwatchClient = CloudWatchAsyncClient.builder()
      .region(region)
      .credentialsProvider(awsCredentialsProvider)
      .build()

    ConfigsBuilderWithStreamName(
      new ConfigsBuilder(
        kinesisReaderConfig.streamName,
        kinesisReaderConfig.appName,
        kinesisClient,
        dynamoClient,
        cloudwatchClient,
        workerId,
        processorFactory
      ),
      kinesisReaderConfig.streamName
    )
  }

  @nowarn("cat=deprecation") // initialPositionInStreamExtended is deprecated, but the upgrade path is unclear
  private def kinesisClientLibScheduler(configsBuilderAndStreamName: ConfigsBuilderWithStreamName): Scheduler = {
    val ConfigsBuilderWithStreamName(configsBuilder, streamName) = configsBuilderAndStreamName
    new Scheduler(
      configsBuilder.checkpointConfig(),
      configsBuilder.coordinatorConfig()
        .clientVersionConfig(ClientVersionConfig.CLIENT_VERSION_CONFIG_COMPATIBLE_WITH_2X),
      configsBuilder.leaseManagementConfig(),
      configsBuilder.lifecycleConfig(),
      configsBuilder.metricsConfig(),
      configsBuilder.processorConfig(),
      configsBuilder.retrievalConfig()
        .initialPositionInStreamExtended(initialPosition)
        .retrievalSpecificConfig(new PollingConfig(streamName, configsBuilder.kinesisClient())),
    )
  }

  private val LiveEventProcessorFactory = new ShardRecordProcessorFactory {
    override def shardRecordProcessor(): ShardRecordProcessor =
      new CrierLiveEventProcessor(config, usageGroupOps, usageGroupStream)
  }

  private val PreviewEventProcessorFactory = new ShardRecordProcessorFactory {
    override def shardRecordProcessor(): ShardRecordProcessor =
      new CrierPreviewEventProcessor(config, usageGroupOps, usageGroupStream)
  }

  private lazy val liveConfig = config.liveKinesisReaderConfig
    .map(kinesisClientLibConfig(LiveEventProcessorFactory))
  private lazy val previewConfig = config.previewKinesisReaderConfig
    .map(kinesisClientLibConfig(PreviewEventProcessorFactory))

  private lazy val liveScheduler = liveConfig.map(kinesisClientLibScheduler)
  private lazy val previewScheduler = previewConfig.map(kinesisClientLibScheduler)

  private val startedSchedulers = scala.collection.mutable.ListBuffer.empty[Scheduler]
  private var maybeShutdown: Option[Future[Unit]] = None

  private def startScheduler(scheduler: Try[Scheduler], name: String): Unit =
    scheduler.fold(
      error => logger.error(s"No '$name' thread to start", error),
      scheduler => {
        executionContext.execute(scheduler)
        startedSchedulers.synchronized { startedSchedulers += scheduler }
        logger.info(s"Starting $name")
      }
    )

  def start(): Unit = {
    logger.info("Trying to start Crier Stream Readers")

    startScheduler(liveScheduler, "Crier Live Stream reader")
    startScheduler(previewScheduler, "Crier Preview Stream reader")
  }

  def stop(): Future[Unit] = synchronized {
    implicit val ec: ExecutionContext = executionContext
    maybeShutdown.getOrElse {
      val shutdown = startedSchedulers.synchronized {
        Future.sequence(startedSchedulers.toList.map(_.startGracefulShutdown().asScala))
      }.map(_ => ())
      maybeShutdown = Some(shutdown)
      shutdown
    }
  }
}
