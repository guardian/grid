package lib.kinesis

import java.net.InetAddress
import java.util.UUID

import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, KinesisClientLibConfiguration}
import lib.ThrallConfig
import org.joda.time.DateTime
import play.api.Logger

object KinesisConfig {
  private val workerId = InetAddress.getLocalHost.getCanonicalHostName + ":" + UUID.randomUUID()

  def kinesisConfig(config: ThrallConfig) = {
    import config.{thrallKinesisEndpoint, thrallKinesisDynamoEndpoint, awsRegion}
    Logger.info(s"creating kinesis consumer with endpoint=$thrallKinesisEndpoint, region=$awsRegion")
    kinesisClientLibConfig(
      kinesisAppName = config.thrallKinesisStream,
      streamName = config.thrallKinesisStream,
      config,
      from = config.from
    ).withKinesisEndpoint(thrallKinesisEndpoint)
      .withDynamoDBEndpoint(thrallKinesisDynamoEndpoint)
  }

  private def kinesisClientLibConfig(kinesisAppName: String, streamName: String, config: ThrallConfig, from: Option[DateTime]): KinesisClientLibConfiguration = {
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
      withCallProcessRecordsEvenForEmptyRecordList(true)

    from.fold(
      kinesisConfig.withInitialPositionInStream(InitialPositionInStream.TRIM_HORIZON)
    ){ f =>
      kinesisConfig.withTimestampAtInitialPositionInStream(f.toDate)
    }
  }
}
