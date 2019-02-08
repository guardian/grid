package lib.kinesis

import java.net.InetAddress
import java.util.UUID

import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorFactory}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, KinesisClientLibConfiguration, Worker}
import lib._
import org.joda.time.DateTime
import play.api.Logger

class ThrallMessageConsumer(config: ThrallConfig,
                            es: ElasticSearchVersion,
                            thrallMetrics: ThrallMetrics,
                            store: ThrallStore,
                            metadataNotifications: DynamoNotifications,
                            syndicationRightsOps: SyndicationRightsOps
                           ) extends MessageConsumerVersion {

  val workerId = InetAddress.getLocalHost.getCanonicalHostName + ":" + UUID.randomUUID()

  private val thrallEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor = new ThrallEventConsumer(es, thrallMetrics, store, metadataNotifications, syndicationRightsOps)
  }

  private val builder: KinesisClientLibConfiguration => Worker = new Worker.Builder().recordProcessorFactory(thrallEventProcessorFactory).config(_).build()
  private val thrallKinesisWorker = builder(kinesisClientLibConfig(kinesisAppName = config.thrallKinesisStream, streamName = config.thrallKinesisStream))
  private val thrallKinesisWorkerThread = makeThread(thrallKinesisWorker)

  def start() = {
    Logger.info("Trying to start Thrall kinesis reader")
    thrallKinesisWorkerThread.start()
    Logger.info("Thrall kinesis reader started")
  }

  private def kinesisClientLibConfig(kinesisAppName: String, streamName: String): KinesisClientLibConfiguration = {
    val credentialsProvider = config.awsCredentials
    new KinesisClientLibConfiguration(
      kinesisAppName,
      streamName,
      credentialsProvider,
      credentialsProvider,
      credentialsProvider,
      workerId
    ).withRegionName(config.awsRegion).
      withInitialPositionInStream(InitialPositionInStream.TRIM_HORIZON).
      withIdleTimeBetweenReadsInMillis(250)
  }

  private def makeThread(worker: Runnable) = new Thread(worker, s"${getClass.getSimpleName}-$workerId")

  override def lastProcessed: DateTime = DateTime.now() // TODO implement

  override def isStopped: Boolean = !thrallKinesisWorkerThread.isAlive

}