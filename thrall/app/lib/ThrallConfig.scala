package lib

import com.gu.mediaservice.lib.aws.AwsClientV2BuilderUtils
import com.gu.mediaservice.lib.cleanup.ReapableEligibiltyResources
import com.gu.mediaservice.lib.config.{CommonConfigWithElastic, GridConfigResources, ReapableEligibilityLoader}
import com.gu.mediaservice.lib.elasticsearch.ReapableEligibility
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.inject.ApplicationLifecycle
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.http.Protocol
import software.amazon.awssdk.http.nio.netty.NettyNioAsyncHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cloudwatch.{CloudWatchAsyncClient, CloudWatchAsyncClientBuilder}
import software.amazon.awssdk.services.dynamodb.{DynamoDbAsyncClient, DynamoDbAsyncClientBuilder}
import software.amazon.awssdk.services.kinesis.{KinesisAsyncClient, KinesisAsyncClientBuilder}
import software.amazon.kinesis.metrics.MetricsLevel

import java.net.URI
import scala.concurrent.duration.{DurationInt, FiniteDuration}
import scala.language.postfixOps

case class KinesisReceiverConfig(
  override val awsRegionV2: Region,
  override val awsCredentialsV2: AwsCredentialsProvider,
  override val awsLocalEndpointUri: Option[URI],
  override val isDev: Boolean,
  streamName: String,
  rewindFrom: Option[DateTime],
  metricsLevel: MetricsLevel = MetricsLevel.NONE
) extends AwsClientV2BuilderUtils {
  lazy val kinesisClient: KinesisAsyncClient = {
    val clientBuilder = withAWSCredentialsV2(KinesisAsyncClient.builder())
    if (isDev) {
      clientBuilder.httpClientBuilder(NettyNioAsyncHttpClient
        .builder()
        .protocol(Protocol.HTTP1_1))
    }
    clientBuilder.build()
  }
  lazy val dynamoClient: DynamoDbAsyncClient = withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()
  lazy val cloudwatchClient: CloudWatchAsyncClient = withAWSCredentialsV2(CloudWatchAsyncClient.builder()).build()
}

object KinesisReceiverConfig {
  def apply(streamName: String, rewindFrom: Option[DateTime], thrallConfig: ThrallConfig): KinesisReceiverConfig = KinesisReceiverConfig(
    thrallConfig.awsRegionV2,
    thrallConfig.awsCredentialsV2,
    thrallConfig.awsLocalEndpointUri,
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
  val reaperPaused: Boolean = false
  val hardReapImagesAge: Int = intDefault("reaper.hard.daysInSoftDelete", 14) // soft deleted images age to be hard deleted by Reaper Controller

  def kinesisConfig: KinesisReceiverConfig = KinesisReceiverConfig(thrallKinesisStream, rewindFrom, this)
  def kinesisLowPriorityConfig: KinesisReceiverConfig = KinesisReceiverConfig(thrallKinesisLowPriorityStream, lowPriorityRewindFrom, this)

  def maybeReapableEligibilityClass(applicationLifecycle: ApplicationLifecycle): Option[ReapableEligibility] = {
    val configLoader = ReapableEligibilityLoader.singletonConfigLoader(ReapableEligibiltyResources(this, resources.actorSystem), applicationLifecycle)
    configuration.getOptional[ReapableEligibility]("reaper.provider")(configLoader)
  }
}
