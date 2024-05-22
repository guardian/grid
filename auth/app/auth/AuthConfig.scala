package auth

import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}
import com.gu.mediaservice.model.Instance

class AuthConfig(resources: GridConfigResources) extends CommonConfig(resources) {
  val rootUri: Instance => String = services.authBaseUri
  val rootInstanceUri: Instance => String = services.authBaseInstanceUri
  val mediaApiUri: Instance => String = services.apiBaseUri
}
