package lib

import com.amazonaws.regions.{Regions, Region}
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}


object Config extends CommonPlayAppProperties with CommonPlayAppConfig {

  val appName = "collections"

  val properties = Properties.fromPath("/etc/gu/collections.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val dynamoRegion: Region = Region.getRegion(Regions.EU_WEST_1)

  val keyStoreBucket = properties("auth.keystore.bucket")

  val collectionsBucket: String = properties("s3.collections.bucket")
  val imageCollectionsTable = properties("dynamo.table.imageCollections")


  val rootUri = services.collectionsBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate

  val corsAllAllowedOrigins = List(services.kahunaBaseUri)
}
