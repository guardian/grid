package lib

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

import scala.concurrent.ExecutionContext


class CollectionsConfig(override val playAppConfiguration: Configuration)(implicit ec: ExecutionContext) extends CommonConfig {

  override lazy val appName = "collections"

  val collectionsTable = string("dynamo.table.collections")
  val imageCollectionsTable = string("dynamo.table.imageCollections")

  val rootUri = services.collectionsBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate
}
