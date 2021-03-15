package lib

import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}
import play.api.Configuration

class AdminToolsConfig(resources: GridConfigResources) extends CommonConfig(resources) {
  // hardcoded for dev
  val apiKey: String = "dev-"

  val rootUri: String = s"admin-tools.media.$domainRoot"
}
