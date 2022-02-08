package lib

import com.amazonaws.auth.{InstanceProfileCredentialsProvider, _}
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorCheckpointer, IRecordProcessorFactory}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, KinesisClientLibConfiguration, ShutdownReason, Worker}
import com.amazonaws.services.kinesis.model.Record
import com.gu.mediaservice.lib.logging.GridLogging

import java.net.InetAddress
import java.util
import java.util.UUID

class FastlyUsageStreamReader(config: UsageConfig) extends GridLogging {

  lazy val workerId: String = InetAddress.getLocalHost.getCanonicalHostName + ":" + UUID.randomUUID()

  val credentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    InstanceProfileCredentialsProvider.getInstance()
  )

  private lazy val dynamoCredentialsProvider = credentialsProvider

  lazy val sessionId: String = "session" + Math.random()
  val initialPosition = InitialPositionInStream.TRIM_HORIZON

  private def kinesisCredentialsProvider(arn: String)  = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
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

  private lazy val fastlyUsagesConfig =
    config.fastlyUsagesKinesisReaderConfig.map(kinesisClientLibConfig)

  protected val FastlyUsageEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor =
      new FastlyUsageEventProcessor(config)
  }

  lazy val fastlyUsagesWorker = fastlyUsagesConfig.map(new Worker.Builder().recordProcessorFactory(FastlyUsageEventProcessorFactory).config(_).build())

  private def makeThread(worker: Runnable) =
    new Thread(worker, s"${getClass.getSimpleName}-$workerId")

  private lazy val fastlyUsageWorkerThread = fastlyUsagesWorker.map(makeThread)

  def start() = {
    fastlyUsageWorkerThread
      .map(_.start)
      .foreach(_ => logger.info("Starting Fastly Usage Stream reader"))
  }
}
