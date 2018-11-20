package lib

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

import scala.concurrent.ExecutionContext


class CollectionsConfig(implicit ec: ExecutionContext) extends CommonConfig {

  override lazy val appName = "collections"

  val collectionsTable = properties("dynamo.table.collections")
  val imageCollectionsTable = properties("dynamo.table.imageCollections")
  val topicArn = properties("sns.topic.arn")

  val rootUri = services.collectionsBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate
}
