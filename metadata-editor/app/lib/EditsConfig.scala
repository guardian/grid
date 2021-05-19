package lib

import com.amazonaws.regions.{Region, RegionUtils}
import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}


class EditsConfig(resources: GridConfigResources) extends CommonConfig(resources) {
  val dynamoRegion: Region = RegionUtils.getRegion(string("aws.region"))

  val collectionsBucket: String = string("s3.collections.bucket")

  val editsTable = string("dynamo.table.edits")
  val editsTablePhotoshootIndex = string("dynamo.globalsecondaryindex.edits.photoshoots")
  val syndicationTable = string("dynamo.table.syndication")

  val queueUrl = string("indexed.images.sqs.queue.url")

  val rootUri: String = services.metadataBaseUri
  val kahunaUri: String = services.kahunaBaseUri
  val loginUriTemplate: String = services.loginUriTemplate
}
