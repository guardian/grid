package lib

import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}


class CollectionsConfig(resources: GridConfigResources) extends CommonConfig(resources) {
  val collectionsTable = string("dynamo.table.collections")
  val imageCollectionsTable = string("dynamo.table.imageCollections")

  val rootUri = services.collectionsBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate
}
