package lib

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

class AdminToolsConfig(override val configuration: Configuration) extends CommonConfig {
  override def appName: String = "admin-tools"

  override lazy val domainRoot: String = sys.env("media_service_domain_root")
  override lazy val properties = Map("auth.keystore.bucket" -> "not-used")

  val apiKey: String = sys.env("media_service_api_key")

  val rootUri: String = s"admin-tools.media.$domainRoot"
}
