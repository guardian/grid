package lib

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

class LeasesConfig(override val configuration: Configuration) extends CommonConfig {

  final override lazy val appName = "leases"

  val topicArn = properties("sns.topic.arn")

  val leasesTable = properties("dynamo.tablename.leasesTable")

  val rootUri: String = services.leasesBaseUri
  val kahunaUri: String = services.kahunaBaseUri
  val loginUriTemplate: String = services.loginUriTemplate

}
