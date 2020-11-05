package lib

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

import scala.concurrent.ExecutionContext


class CollectionsConfig(playAppConfiguration: Configuration) extends CommonConfig(playAppConfiguration) {
  val collectionsTable = string("dynamo.table.collections")
  val imageCollectionsTable = string("dynamo.table.imageCollections")

  val rootUri = services.collectionsBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate
}
