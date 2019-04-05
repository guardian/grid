package lib

import java.net.InetAddress
import java.util.UUID

import play.api.Logger
import com.amazonaws.auth._
import com.amazonaws.auth.InstanceProfileCredentialsProvider
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorFactory}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, KinesisClientLibConfiguration, Worker}
import com.gu.contentapi.client.GuardianContentClient
import _root_.KinesisReaderConfig

import scala.util.Try

class CrierStreamReader(region: String, liveReaderConfig: Try[KinesisReaderConfig], previewReaderConfig: Try[KinesisReaderConfig], capi: GuardianContentClient) {

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
     .withRegionName(region)

  private lazy val liveConfig =
    liveReaderConfig.map(kinesisClientLibConfig)

  private lazy val previewConfig =
    previewReaderConfig.map(kinesisClientLibConfig)

  protected val LiveEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor =
      new CrierLiveEventProcessor(capi)
  }

  protected val PreviewEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor =
      new CrierPreviewEventProcessor(capi)
  }

  lazy val liveWorker = liveConfig.map(new Worker.Builder().recordProcessorFactory(LiveEventProcessorFactory).config(_).build())
  lazy val previewWorker = previewConfig.map(new Worker.Builder().recordProcessorFactory(PreviewEventProcessorFactory).config(_).build())

  private def makeThread(worker: Runnable) =
    new Thread(worker, s"${getClass.getSimpleName}-$workerId")

  private lazy val liveWorkerThread = liveWorker.map(makeThread)
  private lazy val previewWorkerThread = previewWorker.map(makeThread)

  def start() = {
    Logger.info("Trying to start Crier Stream Readers")

    liveWorkerThread
      .map(_.start)
      .foreach(_ => Logger.info("Starting Crier Live Stream reader"))
    previewWorkerThread
      .map(_.start)
      .foreach(_ => Logger.info("Starting Crier Preview Stream reader"))
  }
}
