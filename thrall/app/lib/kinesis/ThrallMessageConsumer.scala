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
                            syndicationRightsOps: SyndicationRightsOps,
                            from: Option[DateTime]
                           ) extends MessageConsumerVersion {

  val workerId = InetAddress.getLocalHost.getCanonicalHostName + ":" + UUID.randomUUID()

  private val thrallEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor = new ThrallEventConsumer(es, thrallMetrics, store, metadataNotifications, syndicationRightsOps)
  }

  private val builder: KinesisClientLibConfiguration => Worker = new Worker.Builder().recordProcessorFactory(thrallEventProcessorFactory).config(_).build()
  private val thrallKinesisWorker = builder(
    kinesisClientLibConfig(kinesisAppName = config.thrallKinesisStream,
    streamName = config.thrallKinesisStream,
    from = from
  ))
  private val thrallKinesisWorkerThread = makeThread(thrallKinesisWorker)

  def start(from: Option[DateTime] = None) = {
    Logger.info("Trying to start Thrall kinesis reader")
    thrallKinesisWorkerThread.start()
    Logger.info("Thrall kinesis reader started")
  }

  private def kinesisClientLibConfig(kinesisAppName: String, streamName: String, from: Option[DateTime]): KinesisClientLibConfiguration = {
    val credentialsProvider = config.awsCredentials

    val kinesisConfig = new KinesisClientLibConfiguration(
      kinesisAppName + from.map(_ => "-rewind").getOrElse(""),
      streamName,
      credentialsProvider,
      credentialsProvider,
      credentialsProvider,
      workerId
    ).withRegionName(config.awsRegion).
      withIdleTimeBetweenReadsInMillis(250)

    from.fold(
      kinesisConfig.withInitialPositionInStream(InitialPositionInStream.TRIM_HORIZON)
    ){ f =>
      kinesisConfig.withTimestampAtInitialPositionInStream(f.toDate)
    }
  }

  private def makeThread(worker: Runnable) = new Thread(worker, s"${getClass.getSimpleName}-$workerId")

  override def lastProcessed: DateTime = DateTime.now() // TODO implement

  override def isStopped: Boolean = !thrallKinesisWorkerThread.isAlive

}