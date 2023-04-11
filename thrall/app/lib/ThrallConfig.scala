package lib

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.services.kinesis.metrics.interfaces.MetricsLevel
import com.gu.mediaservice.lib.aws.AwsClientBuilderUtils
import com.gu.mediaservice.lib.config.{CommonConfigWithElastic, GridConfigResources}
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat

case class KinesisReceiverConfig(
  override val awsRegion: String,
  override val awsCredentials: AWSCredentialsProvider,
  override val awsLocalEndpoint: Option[String],
  override val isDev: Boolean,
  streamName: String,
  rewindFrom: Option[DateTime],
  metricsLevel: MetricsLevel = MetricsLevel.DETAILED
) extends AwsClientBuilderUtils

object KinesisReceiverConfig {
  def apply(streamName: String, rewindFrom: Option[DateTime], thrallConfig: ThrallConfig): KinesisReceiverConfig = KinesisReceiverConfig(
    thrallConfig.awsRegion,
    thrallConfig.awsCredentials,
    thrallConfig.awsLocalEndpoint,
    thrallConfig.isDev,
    streamName,
    rewindFrom
  )
}

class ThrallConfig(resources: GridConfigResources) extends CommonConfigWithElastic(resources) {
  val imageBucket: String = string("s3.image.bucket")

  val thumbnailBucket: String = string("s3.thumb.bucket")


  val metadataTopicArn: String = string("indexed.image.sns.topic.arn")

  val rewindFrom: Option[DateTime] = stringOpt("thrall.kinesis.stream.rewindFrom").map(ISODateTimeFormat.dateTime.parseDateTime)
  val lowPriorityRewindFrom: Option[DateTime] = stringOpt("thrall.kinesis.lowPriorityStream.rewindFrom").map(ISODateTimeFormat.dateTime.parseDateTime)

  val isVersionedS3: Boolean = boolean("s3.image.versioned")

  val projectionParallelism: Int = intDefault("thrall.projection.parallelism", 1)

  val maybePersistenceIdentifier = stringOpt("persistence.identifier")

  def kinesisConfig: KinesisReceiverConfig = KinesisReceiverConfig(thrallKinesisStream, rewindFrom, this)
  def kinesisLowPriorityConfig: KinesisReceiverConfig = KinesisReceiverConfig(thrallKinesisLowPriorityStream, lowPriorityRewindFrom, this)
}
