package auth

import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}
import com.gu.mediaservice.model.Instance

class AuthConfig(resources: GridConfigResources) extends CommonConfig(resources) {
  val rootUri: String = services.authBaseUri
  val mediaApiUri: Instance => String = services.apiBaseUri
}
