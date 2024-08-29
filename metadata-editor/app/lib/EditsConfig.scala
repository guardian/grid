package lib

import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}
import model.UsageRightsLease
import com.gu.mediaservice.model.Instance
import play.api.mvc.RequestHeader


class EditsConfig(resources: GridConfigResources) extends CommonConfig(resources) {
  val editsTable = string("dynamo.table.edits")
  val editsTablePhotoshootIndex = string("dynamo.globalsecondaryindex.edits.photoshoots")
  val syndicationTable = string("dynamo.table.syndication")

  val queueUrl = string("indexed.images.sqs.queue.url")

  val rootUri: Instance => String = services.metadataBaseUri
  val kahunaUri: String = services.kahunaBaseUri
  val loginUriTemplate: String = services.loginUriTemplate

  val usageRightsLeases: Seq[UsageRightsLease] = configuration.getOptional[Seq[UsageRightsLease]]("usageRights.leases").getOrElse(Seq.empty)

  val customSpecialInstructions: Map[String, String] =
    configuration.getOptional[Map[String, String]]("usageInstructions").getOrElse(Map.empty)

  val customUsageRestrictions: Map[String, String] =
    configuration.getOptional[Map[String, String]]("usageRestrictions").getOrElse(Map.empty)

}
