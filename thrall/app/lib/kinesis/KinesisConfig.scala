package lib.kinesis

import com.gu.kinesis.ConsumerConfig
import com.gu.mediaservice.lib.logging.GridLogging
import lib.KinesisReceiverConfig
import software.amazon.kinesis.common.{InitialPositionInStream, InitialPositionInStreamExtended}
import software.amazon.kinesis.metrics.MetricsConfig
import software.amazon.kinesis.retrieval.RetrievalConfig
import software.amazon.kinesis.retrieval.polling.PollingConfig

import java.net.InetAddress
import java.util.UUID

object KinesisConfig extends GridLogging {
  private val workerId = InetAddress.getLocalHost.getCanonicalHostName + ":" + UUID.randomUUID()

  def kinesisConfig(config: KinesisReceiverConfig): ConsumerConfig = {
    val initialPosition = config.rewindFrom match {
      case None => InitialPositionInStreamExtended.newInitialPosition(InitialPositionInStream.TRIM_HORIZON)
      case Some(position) => InitialPositionInStreamExtended.newInitialPositionAtTimestamp(position.toDate)
    }
    val pollingConfig = new PollingConfig(config.streamName, config.kinesisClient)
      .maxRecords(100)
      .idleTimeBetweenReadsInMillis(250)
    val retrievalConfig = new RetrievalConfig(config.kinesisClient, config.streamName, config.streamName)
      .retrievalSpecificConfig(pollingConfig)

    val metricsConfig = new MetricsConfig(config.cloudwatchClient, config.streamName)
      .metricsLevel(config.metricsLevel)

    logger.info(s"Creating consumer config for appName: ${config.appName}, streamName: ${config.streamName} with rewind ${config.rewindFrom} and initial position: $initialPosition")
    val clientConfig = ConsumerConfig(
      streamName = config.streamName,
      appName = config.appName,
      workerId = workerId,
      kinesisClient = config.kinesisClient,
      dynamoClient = config.dynamoClient,
      cloudwatchClient = config.cloudwatchClient,
      initialPositionInStreamExtended = initialPosition,
      coordinatorConfig = None,
      leaseManagementConfig = None,
      metricsConfig = Some(metricsConfig),
      retrievalConfig = Some(retrievalConfig)
    )
    clientConfig
  }
}
