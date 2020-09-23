package lib

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.services.kinesis.metrics.interfaces.MetricsLevel
import com.gu.mediaservice.lib.aws.AwsClientBuilderUtils
import com.gu.mediaservice.lib.config.CommonConfig
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.{Configuration, Mode}

case class KinesisReceiverConfig(
  override val awsRegion: String,
  override val awsCredentials: AWSCredentialsProvider,
  override val awsLocalEndpoint: Option[String],
  streamName: String,
  rewindFrom: Option[DateTime],
  metricsLevel: MetricsLevel = MetricsLevel.DETAILED
) extends AwsClientBuilderUtils

object KinesisReceiverConfig {
  def apply(streamName: String, rewindFrom: Option[DateTime], thrallConfig: ThrallConfig): KinesisReceiverConfig = KinesisReceiverConfig(
    thrallConfig.awsRegion,
    thrallConfig.awsCredentials,
    thrallConfig.awsLocalEndpoint,
    streamName,
    rewindFrom
  )
}

class ThrallConfig(playAppConfiguration: Configuration, mode: Mode) extends CommonConfig("thrall", playAppConfiguration, mode) {
  lazy val queueUrl: String = string("sqs.queue.url")

  lazy val imageBucket: String = string("s3.image.bucket")

  lazy val writeAlias: String = stringDefault("es.index.aliases.write", playAppConfiguration.get[String]("es.index.aliases.write"))

  lazy val thumbnailBucket: String = string("s3.thumb.bucket")

  lazy val elasticsearch6Url: String =  string("es6.url")
  lazy val elasticsearch6Cluster: String = string("es6.cluster")
  lazy val elasticsearch6Shards: Int = string("es6.shards").toInt
  lazy val elasticsearch6Replicas: Int = string("es6.replicas").toInt

  lazy val metadataTopicArn: String = string("indexed.image.sns.topic.arn")

  lazy val rewindFrom: Option[DateTime] = stringOpt("thrall.kinesis.stream.rewindFrom").map(ISODateTimeFormat.dateTime.parseDateTime)
  lazy val lowPriorityRewindFrom: Option[DateTime] = stringOpt("thrall.kinesis.lowPriorityStream.rewindFrom").map(ISODateTimeFormat.dateTime.parseDateTime)

  lazy val isVersionedS3: Boolean = boolean("s3.image.versioned")

  def kinesisConfig: KinesisReceiverConfig = KinesisReceiverConfig(thrallKinesisStream, rewindFrom, this)
  def kinesisLowPriorityConfig: KinesisReceiverConfig = KinesisReceiverConfig(thrallKinesisLowPriorityStream, lowPriorityRewindFrom, this)
}
