package auth

import com.gu.mediaservice.lib.management.ManagementWithPermissions
import com.gu.mediaservice.lib.play.GridComponents
import play.api.ApplicationLoader.Context
import router.Routes

class AuthComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new AuthConfig(configuration)

  val controller = new AuthController(auth, config, controllerComponents)
  val permissionsAwareManagement = new ManagementWithPermissions(controllerComponents, controller)

  override val router = new Routes(httpErrorHandler, controller, permissionsAwareManagement)
}