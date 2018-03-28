package lib

import com.amazonaws.regions.{RegionUtils, Region}
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}


object Config extends CommonPlayAppProperties with CommonPlayAppConfig {

  val appName = "metadata-editor"

  val properties = Properties.fromPath("/etc/gu/metadata-editor.properties")

  val dynamoRegion: Region = RegionUtils.getRegion(properties("aws.region"))

  val keyStoreBucket = properties("auth.keystore.bucket")
  val collectionsBucket: String = properties("s3.collections.bucket")

  val editsTable = properties("dynamo.table.edits")

  val topicArn = properties("sns.topic.arn")
  val queueUrl = properties("indexed.images.sqs.queue.url")

  val rootUri = services.metadataBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate
}
