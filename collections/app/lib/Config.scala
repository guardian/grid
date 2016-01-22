package lib

import com.amazonaws.regions.{RegionUtils, Region}
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}


object Config extends CommonPlayAppProperties with CommonPlayAppConfig {

  val appName = "collections"

  val properties = Properties.fromPath("/etc/gu/collections.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

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
