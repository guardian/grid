package lib

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

class AdminToolsConfig(playAppConfiguration: Configuration) extends CommonConfig(playAppConfiguration) {
  // hardcoded for dev
  val apiKey: String = "dev-"

  val rootUri: String = s"admin-tools.media.$domainRoot"
}
