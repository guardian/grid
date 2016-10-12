package lib

import java.net.InetAddress
import java.util.UUID

import play.api.Logger

import com.amazonaws.auth._
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.internal.StaticCredentialsProvider
import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorFactory}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, Worker, KinesisClientLibConfiguration}

class CrierStreamReader {

  lazy val workerId: String = InetAddress.getLocalHost().getCanonicalHostName() + ":" + UUID.randomUUID()

  val credentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    new InstanceProfileCredentialsProvider()
  )

  private lazy val dynamoCredentialsProvider = credentialsProvider

  lazy val sessionId: String = "session" + Math.random()
  val initialPosition = InitialPositionInStream.TRIM_HORIZON

  private def kinesisCredentialsProvider(arn: String)  = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("capi"),
    new STSAssumeRoleSessionCredentialsProvider(credentialsProvider, arn, sessionId)
  )

  private def kinesisClientLibConfig(config: KinesisReaderConfig) =
    new KinesisClientLibConfiguration(
      config.appName,
      config.streamName,
      kinesisCredentialsProvider(config.arn),
      dynamoCredentialsProvider,
      credentialsProvider,
      workerId
    ).withInitialPositionInStream(initialPosition)
     .withRegionName(Config.awsRegionName)

  private lazy val liveConfig =
    Config.liveKinesisReaderConfig.map(kinesisClientLibConfig)

  private lazy val previewConfig =
    Config.previewKinesisReaderConfig.map(kinesisClientLibConfig)

  protected val LiveEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor =
      new CrierLiveEventProcessor()
  }

  protected val PreviewEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor =
      new CrierPreviewEventProcessor()
  }

  lazy val liveWorker = liveConfig.map(new Worker(LiveEventProcessorFactory, _))
  lazy val previewWorker = previewConfig.map(new Worker(PreviewEventProcessorFactory, _))

  private def makeThread(worker: Runnable) =
    new Thread(worker, s"${getClass.getSimpleName}-$workerId")

  private lazy val liveWorkerThread = liveWorker.map(makeThread)
  private lazy val previewWorkerThread = previewWorker.map(makeThread)

  def start() = {
    liveWorkerThread
      .map(_.start)
      .foreach(_ => Logger.info("Starting Crier Live Stream reader"))
    previewWorkerThread
      .map(_.start)
      .foreach(_ => Logger.info("Starting Crier Preview Stream reader"))
  }
}
