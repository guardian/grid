package lib

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.services.kinesis.metrics.interfaces.MetricsLevel
import com.gu.mediaservice.lib.aws.AwsClientBuilderUtils
import com.gu.mediaservice.lib.config.{CommonConfigWithElastic, GridConfigResources, ReapableEligibilityLoader}
import com.gu.mediaservice.lib.cleanup.ReapableEligibiltyResources
import com.gu.mediaservice.lib.elasticsearch.ReapableEligibility
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.inject.ApplicationLifecycle
import scala.concurrent.duration.{DurationInt, FiniteDuration}
import scala.language.postfixOps

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

  val maybeReaperBucket: Option[String] = stringOpt("s3.reaper.bucket")
  val maybeReaperCountPerRun: Option[Int] = intOpt("reaper.countPerRun")

  val metadataTopicArn: String = string("indexed.image.sns.topic.arn")

  val rewindFrom: Option[DateTime] = stringOpt("thrall.kinesis.stream.rewindFrom").map(ISODateTimeFormat.dateTime.parseDateTime)
  val lowPriorityRewindFrom: Option[DateTime] = stringOpt("thrall.kinesis.lowPriorityStream.rewindFrom").map(ISODateTimeFormat.dateTime.parseDateTime)

  val isVersionedS3: Boolean = boolean("s3.image.versioned")

  val projectionParallelism: Int = intDefault("thrall.projection.parallelism", 1)

  val reaperInterval: FiniteDuration = intDefault("reaper.interval", 15) minutes
  val hardReapImagesAge: Int = intDefault("reaper.hard.daysInSoftDelete", 14) // soft deleted images age to be hard deleted by Reaper Controller

  def kinesisConfig: KinesisReceiverConfig = KinesisReceiverConfig(thrallKinesisStream, rewindFrom, this)
  def kinesisLowPriorityConfig: KinesisReceiverConfig = KinesisReceiverConfig(thrallKinesisLowPriorityStream, lowPriorityRewindFrom, this)

  def maybeReapableEligibilityClass(applicationLifecycle: ApplicationLifecycle): Option[ReapableEligibility] = {
    val configLoader = ReapableEligibilityLoader.singletonConfigLoader(ReapableEligibiltyResources(this, resources.actorSystem), applicationLifecycle)
    configuration.getOptional[ReapableEligibility]("reaper.provider")(configLoader)
  }
}
