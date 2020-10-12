package lib

import com.amazonaws.regions.{Region, RegionUtils}
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration


class EditsConfig(playAppConfiguration: Configuration) extends CommonConfig(playAppConfiguration) {
  val dynamoRegion: Region = RegionUtils.getRegion(string("aws.region"))

  val keyStoreBucket = string("auth.keystore.bucket")
  val collectionsBucket: String = string("s3.collections.bucket")

  val editsTable = string("dynamo.table.edits")

  val queueUrl = string("indexed.images.sqs.queue.url")

  val rootUri: String = services.metadataBaseUri
  val kahunaUri: String = services.kahunaBaseUri
  val loginUriTemplate: String = services.loginUriTemplate
}
