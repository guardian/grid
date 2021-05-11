package auth

import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}

class AuthConfig(resources: GridConfigResources) extends CommonConfig(resources) {
  val rootUri: String = services.authBaseUri
  val mediaApiUri: String = services.apiBaseUri
  val kahunaUri = services.kahunaBaseUri
}
