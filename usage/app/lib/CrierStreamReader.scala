package lib

import java.net.InetAddress
import java.util.UUID

import com.amazonaws.auth._
import com.amazonaws.auth.InstanceProfileCredentialsProvider
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorFactory}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, KinesisClientLibConfiguration, Worker}
import com.gu.mediaservice.lib.logging.GridLogging

class CrierStreamReader(config: UsageConfig) extends GridLogging {

  lazy val workerId: String = InetAddress.getLocalHost.getCanonicalHostName + ":" + UUID.randomUUID()

  val credentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    InstanceProfileCredentialsProvider.getInstance()
  )

  private lazy val dynamoCredentialsProvider = credentialsProvider

  lazy val sessionId: String = "session" + Math.random()
  val initialPosition = InitialPositionInStream.TRIM_HORIZON

  private def kinesisCredentialsProvider(arn: String)  = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("capi"),
    new STSAssumeRoleSessionCredentialsProvider.Builder(arn, sessionId).build()
  )

  private def kinesisClientLibConfig(kinesisReaderConfig: KinesisReaderConfig) =
    new KinesisClientLibConfiguration(
      kinesisReaderConfig.appName,
      kinesisReaderConfig.streamName,
      kinesisCredentialsProvider(kinesisReaderConfig.arn),
      dynamoCredentialsProvider,
      credentialsProvider,
      workerId
    ).withInitialPositionInStream(initialPosition)
     .withRegionName(config.awsRegionName)

  private lazy val liveConfig =
    config.liveKinesisReaderConfig.map(kinesisClientLibConfig)

  private lazy val previewConfig =
    config.previewKinesisReaderConfig.map(kinesisClientLibConfig)

  protected val LiveEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor =
      new CrierLiveEventProcessor(config)
  }

  protected val PreviewEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor =
      new CrierPreviewEventProcessor(config)
  }

  lazy val liveWorker = liveConfig.map(new Worker.Builder().recordProcessorFactory(LiveEventProcessorFactory).config(_).build())
  lazy val previewWorker = previewConfig.map(new Worker.Builder().recordProcessorFactory(PreviewEventProcessorFactory).config(_).build())

  private def makeThread(worker: Runnable) =
    new Thread(worker, s"${getClass.getSimpleName}-$workerId")

  private lazy val liveWorkerThread = liveWorker.map(makeThread)
  private lazy val previewWorkerThread = previewWorker.map(makeThread)

  def start() = {
    logger.info("Trying to start Crier Stream Readers")

    liveWorkerThread
      .map(_.start)
      .foreach(_ => logger.info("Starting Crier Live Stream reader"))
    previewWorkerThread
      .map(_.start)
      .foreach(_ => logger.info("Starting Crier Preview Stream reader"))
  }
}
