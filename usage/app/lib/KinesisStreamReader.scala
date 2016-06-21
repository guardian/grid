package lib

import java.net.InetAddress
import java.util.UUID

import com.amazonaws.auth._
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.internal.StaticCredentialsProvider
import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorFactory}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, Worker, KinesisClientLibConfiguration}
import com.gu.logback.appender.kinesis.helpers.CustomCredentialsProviderChain

class KinesisStreamReader {

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

  private lazy val kinesisCredentialsProvider: AWSCredentialsProvider = new AWSCredentialsProviderChain(
    new STSAssumeRoleSessionCredentialsProvider(credentialsProvider, Config.crierArn, sessionId)
  )

  private lazy val config = new KinesisClientLibConfiguration(
    Config.crierAppName,
    Config.crierKinesisStream,
    kinesisCredentialsProvider,
    dynamoCredentialsProvider,
    null,
    workerId)
    .withInitialPositionInStream(initialPosition)
    .withRegionName("eu-west-1")

  protected val eventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor =
      new CrierEventProcessor()
  }

  lazy val worker = new Worker(eventProcessorFactory, config)

  private lazy val workerThread =
    new Thread(worker, s"${getClass.getSimpleName}-$workerId")

  def start() = {
    workerThread.start()
  }

}
