package lib

import java.net.InetAddress
import java.util.UUID

import com.amazonaws.auth._
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.internal.StaticCredentialsProvider
import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorFactory}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, Worker, KinesisClientLibConfiguration}
import com.gu.logback.appender.kinesis.helpers.CustomCredentialsProviderChain

class CrierStreamReader {

  lazy val workerId: String = InetAddress.getLocalHost().getCanonicalHostName() + ":" + UUID.randomUUID()

  val credentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-api"),
    new StaticCredentialsProvider(
      new BasicAWSCredentials(Config.awsCredentials.getAWSAccessKeyId(), Config.awsCredentials.getAWSSecretKey())
    )
  )

  private lazy val dynamoCredentialsProvider = credentialsProvider

  lazy val sessionId: String = "session" + Math.random()
  val initialPosition = InitialPositionInStream.TRIM_HORIZON

  private lazy val LiveKinesisCredentialsProvider: AWSCredentialsProvider = new AWSCredentialsProviderChain(
    new STSAssumeRoleSessionCredentialsProvider(credentialsProvider, Config.crierLiveArn, sessionId)
  )

  private lazy val previewKinesisCredentialsProvider: AWSCredentialsProvider = new AWSCredentialsProviderChain(
    new STSAssumeRoleSessionCredentialsProvider(credentialsProvider, Config.crierPreviewArn, sessionId)
  )

  private lazy val liveConfig = new KinesisClientLibConfiguration(
    Config.crierAppName,
    Config.crierLiveKinesisStream,
    LiveKinesisCredentialsProvider,
    dynamoCredentialsProvider,
    null,
    workerId)
    .withInitialPositionInStream(initialPosition)
    .withRegionName(Config.awsRegionName)

  private lazy val previewConfig = new KinesisClientLibConfiguration(
    Config.crierAppName,
    Config.crierPreviewKinesisStream,
    previewKinesisCredentialsProvider,
    dynamoCredentialsProvider,
    null,
    workerId)
    .withInitialPositionInStream(initialPosition)
    .withRegionName("eu-west-1")

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
