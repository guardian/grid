package lib.kinesis

import java.net.InetAddress
import java.util.UUID

import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorFactory}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, KinesisClientLibConfiguration, Worker}
import lib._
import org.joda.time.DateTime
import play.api.Logger

class ThrallMessageConsumer(config: ThrallConfig,
                            es: ElasticSearch6,
                            thrallMetrics: ThrallMetrics,
                            store: ThrallStore,
                            metadataEditorNotifications: MetadataEditorNotifications,
                            syndicationRightsOps: SyndicationRightsOps,
                            from: Option[DateTime]) {

  private val workerId = InetAddress.getLocalHost.getCanonicalHostName + ":" + UUID.randomUUID()

  private val thrallEventProcessorFactory = new IRecordProcessorFactory {
    override def createProcessor(): IRecordProcessor = new ThrallEventConsumer(es, thrallMetrics, store, metadataEditorNotifications, syndicationRightsOps)
  }

  private def createKinesisWorker(cfg: KinesisClientLibConfiguration): Worker = {
    new Worker.Builder()
      .recordProcessorFactory(thrallEventProcessorFactory)
      .config(cfg)
      .build()
  }

  private val kinesisCfg = kinesisClientLibConfig(
    kinesisAppName = config.thrallKinesisStream,
    streamName = config.thrallKinesisStream,
    from = from
  )

  private def getThrallKinesisWorker = {
    import config.{thrallKinesisEndpoint, thrallKinesisDynamoEndpoint, awsRegion}
    Logger.info(s"creating kinesis consumer with endpoint=$thrallKinesisEndpoint, region=$awsRegion")
    val kinesisCfgWithEndpoints = kinesisCfg
      .withKinesisEndpoint(thrallKinesisEndpoint)
      .withDynamoDBEndpoint(thrallKinesisDynamoEndpoint)
    createKinesisWorker(kinesisCfgWithEndpoints)
  }

  private val thrallKinesisWorker = getThrallKinesisWorker

  private val thrallKinesisWorkerThread = makeThread(thrallKinesisWorker)

  def start(from: Option[DateTime] = None) = {
    Logger.info("Trying to start Thrall kinesis reader")
    thrallKinesisWorkerThread.start()
    Logger.info("Thrall kinesis reader started")
  }

  private def kinesisClientLibConfig(kinesisAppName: String, streamName: String, from: Option[DateTime]): KinesisClientLibConfiguration = {
    val credentialsProvider = config.awsCredentials

    val kinesisConfig = new KinesisClientLibConfiguration(
      kinesisAppName,
      streamName,
      credentialsProvider,
      credentialsProvider,
      credentialsProvider,
      workerId
    ).withRegionName(config.awsRegion).
      withMaxRecords(100).
      withIdleMillisBetweenCalls(1000).
      withIdleTimeBetweenReadsInMillis(250)

    from.fold(
      kinesisConfig.withInitialPositionInStream(InitialPositionInStream.TRIM_HORIZON)
    ){ f =>
      kinesisConfig.withTimestampAtInitialPositionInStream(f.toDate)
    }
  }

  private def makeThread(worker: Runnable) = new Thread(worker, s"${getClass.getSimpleName}-$workerId")

  def isStopped: Boolean = !thrallKinesisWorkerThread.isAlive

}
