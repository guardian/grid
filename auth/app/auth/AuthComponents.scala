package auth

import com.gu.mediaservice.lib.management.ManagementWithPermissions
import com.gu.mediaservice.lib.play.AuthGridComponents
import play.api.ApplicationLoader.Context
import router.Routes

class AuthComponents(context: Context) extends AuthGridComponents(context) {
  // TODO MRB: ensure sameSite = None
  val controller = new AuthController(auth, config, controllerComponents)
  val permissionsAwareManagement = new ManagementWithPermissions(controllerComponents, controller)

  override val router = new Routes(httpErrorHandler, controller, permissionsAwareManagement)
}
