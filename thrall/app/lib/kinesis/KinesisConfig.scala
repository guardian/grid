package lib.kinesis

import java.net.InetAddress
import java.util.UUID

import com.amazonaws.services.kinesis.clientlibrary.lib.worker.{InitialPositionInStream, KinesisClientLibConfiguration}
import lib.{ThrallConfig, KinesisReceiverConfig}
import org.joda.time.DateTime
import play.api.Logger

object KinesisConfig {
  private val workerId = InetAddress.getLocalHost.getCanonicalHostName + ":" + UUID.randomUUID()

  def kinesisConfig(config: KinesisReceiverConfig) = {

    Logger.info(s"creating kinesis consumer with endpoint=${config.thrallKinesisEndpoint}, region=${config.awsRegion}")
    kinesisClientLibConfig(
      kinesisAppName = config.streamName,
      streamName = config.streamName,
      config,
      from = config.rewindFrom
    ).withKinesisEndpoint(config.thrallKinesisEndpoint)
      .withDynamoDBEndpoint(config.thrallKinesisDynamoEndpoint)
  }

  private def kinesisClientLibConfig(kinesisAppName: String, streamName: String, config: KinesisReceiverConfig, from: Option[DateTime]): KinesisClientLibConfiguration = {
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
