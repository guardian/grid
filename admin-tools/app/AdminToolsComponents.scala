import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.play.GridComponents
import controllers.AdminToolsCtr
import lib.AdminToolsConfig
import play.api.ApplicationLoader.Context

class AdminToolsComponents(context: Context) extends GridComponents(context) {

  override def config: CommonConfig = new AdminToolsConfig(configuration)

  final override val buildInfo = utils.buildinfo.BuildInfo

  val controller = new AdminToolsCtr(controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
