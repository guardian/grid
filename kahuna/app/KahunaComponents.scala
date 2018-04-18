import com.gu.mediaservice.lib.play.GridComponents
import controllers.{AssetsComponents, KahunaController}
import lib.KahunaConfig
import play.api.ApplicationLoader.Context
import router.Routes

class KahunaComponents(context: Context) extends GridComponents(context) with AssetsComponents {
  final override lazy val config = new KahunaConfig(configuration)

  val controller = new KahunaController(config, controllerComponents)
  override lazy val router = new Routes(httpErrorHandler, controller, assets, management)
}
