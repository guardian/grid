import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.play.GridComponents
import controllers.AdminToolsCtr
import lib.AdminToolsConfig
import play.api.ApplicationLoader.Context
import router.Routes

class AdminToolsComponents(context: Context) extends GridComponents(context) {

  final override lazy val config = new AdminToolsConfig(configuration)

  final override val buildInfo = utils.buildinfo.BuildInfo

  val notifications = new ThrallMessageSender(config)

  val controller = new AdminToolsCtr(config, controllerComponents, notifications)

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
