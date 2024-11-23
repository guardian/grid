package lib

import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}
import com.gu.mediaservice.model.Instance


class CollectionsConfig(resources: GridConfigResources) extends CommonConfig(resources) {
  val collectionsTable = string("dynamo.table.collections")
  val imageCollectionsTable = string("dynamo.table.imageCollections")

  val rootUri: Instance => String = services.collectionsBaseUri
}
