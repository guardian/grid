package lib

import com.amazonaws.regions.{RegionUtils, Region}
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}

import scala.util.Try

object Config extends CommonPlayAppProperties with CommonPlayAppConfig {

  val appName = "usage"

  val properties = Properties.fromPath("/etc/gu/usage.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val keyStoreBucket = properties("auth.keystore.bucket")
  val awsRegion = "eu-west-1"

  lazy val rootUri = services.metadataBaseUri
  lazy val kahunaUri = services.kahunaBaseUri
  lazy val usageUri = services.usageBaseUri
  lazy val apiUri = services.apiBaseUri
  lazy val loginUriTemplate = services.loginUriTemplate

  val defaultPageSize = 100
  val defaultMaxRetries = 6
  val defaultMaxPrintRequestSizeInKb = 500

  val maxPrintRequestLengthInKb = Try(properties("api.setPrint.maxLength").toInt)
    .getOrElse[Int](defaultMaxPrintRequestSizeInKb)

  val capiPollIntervalInSeconds = properties("capi.pollIntervalInSeconds").toLong
  val capiLiveUrl = properties("capi.live.url")
  val capiApiKey = properties("capi.apiKey")
  val capiPreviewUrl = properties("capi.preview.url")
  val capiPreviewUser = properties("capi.preview.user")
  val capiPreviewPassword = properties("capi.preview.password")
  val capiPageSize = Try(properties("capi.page.size").toInt).getOrElse[Int](defaultPageSize)
  val capiMaxRetries = Try(properties("capi.maxRetries").toInt).getOrElse[Int](defaultMaxRetries)

  val topicArn = properties("sns.topic.arn")
  val composerBaseUrl = properties("composer.baseUrl")

  val livePollTable = properties("dynamo.tablename.livePollTable")
  val previewPollTable = properties("dynamo.tablename.previewPollTable")
  val usageRecordTable = properties("dynamo.tablename.usageRecordTable")

  val dynamoRegion: Region = RegionUtils.getRegion(properties("aws.region"))

  val corsAllAllowedOrigins = List(services.kahunaBaseUri)

  val crierKinesisStream = properties("crier.kinesis")

  val crierAppName = properties("crier.app.name")

  val crierArn = properties("crier.arn")
}
