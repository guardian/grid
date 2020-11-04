package lib.kinesis

import java.net.InetAddress
import java.util.UUID

import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, KinesisClientLibConfiguration}
import com.amazonaws.services.kinesis.metrics.interfaces.MetricsLevel
import com.gu.mediaservice.lib.logging.GridLogging
import lib.KinesisReceiverConfig
import org.joda.time.DateTime
object KinesisConfig extends GridLogging {
  private val workerId = InetAddress.getLocalHost.getCanonicalHostName + ":" + UUID.randomUUID()

  def kinesisConfig(config: KinesisReceiverConfig): KinesisClientLibConfiguration = {
    val clientConfig = kinesisClientLibConfig(
      kinesisAppName = config.streamName,
      streamName = config.streamName,
      config,
      from = config.rewindFrom,
      config.metricsLevel
    )

    config.awsLocalEndpoint.map(endpoint => {
      logger.info(s"creating kinesis consumer with endpoint=$endpoint")
      clientConfig.withKinesisEndpoint(endpoint).withDynamoDBEndpoint(endpoint)
    }).getOrElse(clientConfig)
  }

  private def kinesisClientLibConfig(kinesisAppName: String, streamName: String, config: KinesisReceiverConfig, from: Option[DateTime], metricsLevel: MetricsLevel): KinesisClientLibConfiguration = {
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
      withIdleTimeBetweenReadsInMillis(250).
      withCallProcessRecordsEvenForEmptyRecordList(true).
      withMetricsLevel(metricsLevel)

    from.fold(
      kinesisConfig.withInitialPositionInStream(InitialPositionInStream.TRIM_HORIZON)
    ){ f =>
      kinesisConfig.withTimestampAtInitialPositionInStream(f.toDate)
    }
  }
}
