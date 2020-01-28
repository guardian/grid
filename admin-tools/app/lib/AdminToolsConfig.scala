package lib

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

class AdminToolsConfig(override val configuration: Configuration) extends CommonConfig {
  override def appName: String = "admin-tools"

  override lazy val domainRoot: String = "local.dev-gutools.co.uk"
  override lazy val properties = Map("auth.keystore.bucket" -> "not-used")
}
