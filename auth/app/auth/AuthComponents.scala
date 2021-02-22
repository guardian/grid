package auth

import com.gu.mediaservice.lib.management.Management
import com.gu.mediaservice.lib.play.GridComponents
import play.api.ApplicationLoader.Context
import play.api.{Configuration, Environment}
import play.api.http.HttpConfiguration
import router.Routes

class AuthComponents(context: Context) extends GridComponents(context, new AuthConfig(_)) {
  final override lazy val httpConfiguration = AuthHttpConfig(configuration, context.environment)

  final override val buildInfo = utils.buildinfo.BuildInfo

  val controller = new AuthController(auth, providers, config, controllerComponents, authorisationProvider)
  val permissionsAwareManagement = new Management(controllerComponents, buildInfo)

  override val router = new Routes(httpErrorHandler, controller, permissionsAwareManagement)
}

object AuthHttpConfig {
  def apply(playConfig: Configuration, environment: Environment): HttpConfiguration = {
    val base = HttpConfiguration.fromConfiguration(playConfig, environment)
    base.copy(session =
      base.session.copy(sameSite = None)
    )
  }
}
