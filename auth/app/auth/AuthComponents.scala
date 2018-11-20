package auth

import com.gu.mediaservice.lib.play.GridComponents
import play.api.ApplicationLoader.Context
import router.Routes

class AuthComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new AuthConfig()

  val controller = new AuthController(auth, config, controllerComponents)
  override val router = new Routes(httpErrorHandler, controller, management)
}