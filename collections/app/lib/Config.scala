package lib

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.regions.{Region, RegionUtils}
import com.gu.mediaservice.lib.config.{CommonPlayAppConfig, CommonPlayAppProperties, Properties}
import com.amazonaws.auth._
import play.api.Configuration


class Config(override val configuration: Configuration) extends CommonPlayAppProperties with CommonPlayAppConfig {

  val appName = "collections"

  val properties = Properties.fromPath("/etc/gu/collections.properties")

  val awsCredentials: AWSCredentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    InstanceProfileCredentialsProvider.getInstance()
  )

  val dynamoRegion: Region = RegionUtils.getRegion(properties("aws.region"))

  val keyStoreBucket = properties("auth.keystore.bucket")

  val collectionsTable = properties("dynamo.table.collections")
  val imageCollectionsTable = properties("dynamo.table.imageCollections")
  val topicArn = properties("sns.topic.arn")

  val rootUri = services.collectionsBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate

  private lazy val corsAllowedOrigins = properties.getOrElse("cors.allowed.origins", "").split(",").toList
  val corsAllAllowedOrigins = services.kahunaBaseUri :: corsAllowedOrigins
}
