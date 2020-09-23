package lib

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.{Configuration, Mode}

import scala.concurrent.ExecutionContext


class CollectionsConfig(playAppConfiguration: Configuration, mode: Mode)(implicit ec: ExecutionContext) extends CommonConfig("collections", playAppConfiguration, mode) {
  val collectionsTable = string("dynamo.table.collections")
  val imageCollectionsTable = string("dynamo.table.imageCollections")

  val rootUri = services.collectionsBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate
}
