package lib

import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.lib.config.{CommonConfig, Properties}
import play.api.Configuration

import scala.concurrent.ExecutionContext


class CollectionsConfig(override val configuration: Configuration)(implicit ec: ExecutionContext) extends CommonConfig {

  override lazy val appName = "collections"
  override lazy val properties = Properties.fromPath("/etc/gu/collections.properties")

  val dynamoRegion: String = properties("aws.region")

  val keyStoreBucket = properties("auth.keystore.bucket")
  val keyStore = new KeyStore(keyStoreBucket, awsCredentials)

  val collectionsTable = properties("dynamo.table.collections")
  val imageCollectionsTable = properties("dynamo.table.imageCollections")
  val topicArn = properties("sns.topic.arn")

  val rootUri = services.collectionsBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate
}
