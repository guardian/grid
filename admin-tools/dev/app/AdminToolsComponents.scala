import com.gu.mediaservice.lib.play.GridComponents
import controllers.AdminToolsCtr
import lib.AdminToolsConfig
import play.api.ApplicationLoader.Context
import play.api.Configuration
import router.Routes

class AdminToolsComponents(context: Context) extends GridComponents(context) {

  final override lazy val config = new AdminToolsConfig(
    configuration ++ Configuration.from(Map(
      "domain.root" -> "local.dev-gutools.co.uk",
      "auth.keystore.bucket" -> "not-used"
    )),
    context.environment.mode
  )

  final override val buildInfo = utils.buildinfo.BuildInfo

  val controller = new AdminToolsCtr(config, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
