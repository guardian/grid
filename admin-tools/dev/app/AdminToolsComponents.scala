import com.gu.mediaservice.lib.play.GridComponents
import controllers.AdminToolsCtr
import lib.AdminToolsConfig
import play.api.ApplicationLoader.Context
import router.Routes

class AdminToolsComponents(context: Context) extends GridComponents(context) {

  final override lazy val config = new AdminToolsConfig(configuration)

  final override val buildInfo = utils.buildinfo.BuildInfo

  val controller = new AdminToolsCtr(config, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
