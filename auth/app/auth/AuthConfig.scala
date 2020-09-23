package auth

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.{Configuration, Mode}

import scala.concurrent.ExecutionContext

class AuthConfig(playAppConfiguration: Configuration, mode: Mode)(implicit ec: ExecutionContext) extends CommonConfig("auth", playAppConfiguration, mode) {
  val rootUri: String = services.authBaseUri
  val mediaApiUri: String = services.apiBaseUri
  val kahunaUri = services.kahunaBaseUri
}
