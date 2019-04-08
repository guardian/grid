package auth

import com.gu.mediaservice.lib.auth.PermissionsHandler
import com.gu.mediaservice.lib.management.ManagementWithPermissions
import com.gu.mediaservice.lib.play.{GridAuthentication, GridComponents}
import play.api.ApplicationLoader.Context
import router.Routes

class AuthComponents(context: Context) extends GridComponents("auth", context) with GridAuthentication {
  val permissionStage = config.get[String]("permissions.stage")
  val permissionsHandler = new PermissionsHandler(permissionStage, region, awsCredentials)

  val controller = new AuthController(auth, services, permissionsHandler, controllerComponents)
  val permissionsAwareManagement = new ManagementWithPermissions(controllerComponents, permissionsHandler)

  override val router = new Routes(httpErrorHandler, controller, permissionsAwareManagement)
}
