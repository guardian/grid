import com.gu.mediaservice.lib.config.GridConfigResources
import com.gu.mediaservice.lib.play.GridComponents
import controllers.AdminToolsCtr
import lib.AdminToolsConfig
import play.api.ApplicationLoader.Context
import play.api.Configuration
import router.Routes

object AdminToolsComponents {
  def config(resources: GridConfigResources) = new AdminToolsConfig(
    resources.configuration ++ Configuration.from(Map(
      "domain.root" -> "local.dev-gutools.co.uk",
      "auth.keystore.bucket" -> "not-used",
      "thrall.kinesis.stream.name"-> "not-used",
      "thrall.kinesis.lowPriorityStream.name"-> "not-used"
    ))
  )
}

class AdminToolsComponents(context: Context) extends GridComponents(context, AdminToolsComponents.config) {
  final override val buildInfo = utils.buildinfo.BuildInfo

  val controller = new AdminToolsCtr(config, controllerComponents)(wsClient, ec)

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
