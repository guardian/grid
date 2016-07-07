package lib

import java.net.InetAddress
import java.util.UUID

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

  private lazy val LiveKinesisCredentialsProvider: AWSCredentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("capi"),
    new STSAssumeRoleSessionCredentialsProvider(credentialsProvider, Config.crierLiveArn, sessionId)
  )

  private lazy val previewKinesisCredentialsProvider: AWSCredentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("capi"),
    new STSAssumeRoleSessionCredentialsProvider(credentialsProvider, Config.crierPreviewArn, sessionId)
  )

  private lazy val liveConfig = new KinesisClientLibConfiguration(
    Config.liveAppName,
    Config.crierLiveKinesisStream,
    LiveKinesisCredentialsProvider,
    dynamoCredentialsProvider,
    credentialsProvider,
    workerId)
    .withInitialPositionInStream(initialPosition)
    .withRegionName(Config.awsRegionName)

  private lazy val previewConfig = new KinesisClientLibConfiguration(
    Config.previewAppName,
    Config.crierPreviewKinesisStream,
    previewKinesisCredentialsProvider,
    dynamoCredentialsProvider,
    credentialsProvider,
    workerId)
    .withInitialPositionInStream(initialPosition)
    .withRegionName(Config.awsRegionName)

  protected val LiveEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor =
      new CrierLiveEventProcessor()
  }

  protected val PreviewEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor =
      new CrierPreviewEventProcessor()
  }

  lazy val liveWorker = new Worker(LiveEventProcessorFactory, liveConfig)
  lazy val previewWorker = new Worker(PreviewEventProcessorFactory, previewConfig)

  private lazy val liveWorkerThread =
    new Thread(liveWorker, s"${getClass.getSimpleName}-$workerId")

  private lazy val previewWorkerThread =
    new Thread(previewWorker, s"${getClass.getSimpleName}-$workerId")

  def start() = {
    liveWorkerThread.start()
    previewWorkerThread.start()
  }

}
