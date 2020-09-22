package lib

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

class AdminToolsConfig(override val playAppConfiguration: Configuration) extends CommonConfig {
  override def appName: String = "admin-tools"

  // hardcoded for dev
  override lazy val domainRoot: String = "local.dev-gutools.co.uk"
  override lazy val properties = Map("auth.keystore.bucket" -> "not-used")

  // hardcoded for dev
  val apiKey: String = "dev-"

  val rootUri: String = s"admin-tools.media.$domainRoot"
}
