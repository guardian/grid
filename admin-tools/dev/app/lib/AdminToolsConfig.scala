package lib

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.{Configuration, Mode}

class AdminToolsConfig(playAppConfiguration: Configuration, mode: Mode) extends CommonConfig("admin-tools", playAppConfiguration, mode) {
  // hardcoded for dev
  val apiKey: String = "dev-"

  val rootUri: String = s"admin-tools.media.$domainRoot"
}
