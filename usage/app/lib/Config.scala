package lib

import com.amazonaws.regions.{Regions, Region}
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}


object Config extends CommonPlayAppProperties with CommonPlayAppConfig {

  val appName = "usage"

  val properties = Properties.fromPath("/etc/gu/usage.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val keyStoreBucket = properties("auth.keystore.bucket")

  lazy val rootUri = services.metadataBaseUri
  lazy val kahunaUri = services.kahunaBaseUri
  lazy val loginUriTemplate = services.loginUriTemplate

  val capiPollIntervalInSeconds = properties("capi.pollIntervalInSeconds").toLong
  val capiLiveUrl = properties("capi.live.url")
  val capiApiKey = properties("capi.apiKey")
  val capiPreviewUrl = properties("capi.preview.url")
  val capiPreviewUser = properties("capi.preview.user")
  val capiPreviewPassword = properties("capi.preview.password")

  val composerBaseUrl = properties("composer.baseUrl")

  val livePollTable = properties("dynamo.tablename.livePollTable")
  val previewPollTable = properties("dynamo.tablename.previewPollTable")
  val usageRecordTable = properties("dynamo.tablename.usageRecordTable")

  val dynamoRegion: Region = Region.getRegion(Regions.EU_WEST_1)

  val corsAllAllowedOrigins = List(services.kahunaBaseUri)
}
