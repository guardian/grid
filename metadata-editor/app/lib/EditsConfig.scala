package lib

import com.amazonaws.regions.{Region, RegionUtils}
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration


class EditsConfig(override val configuration: Configuration) extends CommonConfig {

  final override lazy val appName = "metadata-editor"

  val dynamoRegion: Region = RegionUtils.getRegion(properties("aws.region"))

  val editsTable = properties("dynamo.table.edits")

  val topicArn = properties("sns.topic.arn")
  val queueUrl = properties("indexed.images.sqs.queue.url")

  val rootUri: String = services.metadataBaseUri
  val kahunaUri: String = services.kahunaBaseUri
  val loginUriTemplate: String = services.loginUriTemplate
}
