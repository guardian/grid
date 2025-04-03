package lib.kinesis

import com.gu.kinesis.ConsumerConfig
import com.gu.mediaservice.lib.logging.GridLogging
import lib.KinesisReceiverConfig
import software.amazon.awssdk.services.dynamodb.model.BillingMode
import software.amazon.kinesis.common.{InitialPositionInStream, InitialPositionInStreamExtended}
import software.amazon.kinesis.leases.LeaseManagementConfig
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

    val handoffConfig = LeaseManagementConfig.GracefulLeaseHandoffConfig.builder().isGracefulLeaseHandoffEnabled(false).build()

    val leaseManagementConfig = new LeaseManagementConfig(
      config.streamName,
      config.streamName,
      config.dynamoClient,
      config.kinesisClient,
      workerId,
    ).billingMode(BillingMode.PAY_PER_REQUEST).gracefulLeaseHandoffConfig(handoffConfig)

    val clientConfig = ConsumerConfig(
      streamName = config.streamName,
      appName = config.streamName,
      workerId = workerId,
      kinesisClient = config.kinesisClient,
      dynamoClient = config.dynamoClient,
      cloudwatchClient = config.cloudwatchClient,
      initialPositionInStreamExtended = initialPosition,
      coordinatorConfig = None,
      leaseManagementConfig = Some(leaseManagementConfig),
      metricsConfig = Some(metricsConfig),
      retrievalConfig = Some(retrievalConfig)
    )
    clientConfig
  }
}
