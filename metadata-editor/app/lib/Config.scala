package lib

import com.amazonaws.regions.{Regions, Region}
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}


object Config extends CommonPlayAppProperties with CommonPlayAppConfig {

  val appName = "metadata-editor"

  val properties = Properties.fromPath("/etc/gu/metadata-editor.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val dynamoRegion: Region = Region.getRegion(Regions.EU_WEST_1)

  val keyStoreBucket = properties("auth.keystore.bucket")

  val editsTable = properties("dynamo.table.edits")

  val topicArn = properties("sns.topic.arn")
  val queueUrl = properties("indexed.images.sqs.queue.url")

  val rootUri = services.metadataBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate

  val corsAllAllowedOrigins = List(services.kahunaBaseUri)
}
