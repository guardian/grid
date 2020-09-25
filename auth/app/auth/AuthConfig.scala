package auth

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

import scala.concurrent.ExecutionContext

class AuthConfig(playAppConfiguration: Configuration)(implicit ec: ExecutionContext) extends CommonConfig(playAppConfiguration) {
  val rootUri: String = services.authBaseUri
  val mediaApiUri: String = services.apiBaseUri
  val kahunaUri = services.kahunaBaseUri
}
