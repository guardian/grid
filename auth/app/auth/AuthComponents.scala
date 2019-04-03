package auth

import com.gu.mediaservice.lib.management.ManagementWithPermissions
import com.gu.mediaservice.lib.play.{GridAuthentication, GridComponents}
import play.api.ApplicationLoader.Context
import router.Routes

class AuthComponents(context: Context) extends GridComponents(context) with GridAuthentication {
  // TODO MRB: ensure sameSite = None
  val controller = new AuthController(auth, config, controllerComponents)
  val permissionsAwareManagement = new ManagementWithPermissions(controllerComponents, controller)

  override val router = new Routes(httpErrorHandler, controller, permissionsAwareManagement)
}
