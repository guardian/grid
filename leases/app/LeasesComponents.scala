import com.gu.mediaservice.lib.play.GridComponents
import controllers.MediaLeaseController
import lib.{LeaseNotifier, LeaseStore, LeasesConfig}
import play.api.ApplicationLoader.Context
import router.Routes

class LeasesComponents(context: Context) extends GridComponents(context, new LeasesConfig(_)) {
  final override val buildInfo = utils.buildinfo.BuildInfo

  val store = new LeaseStore(config)
  val notifications = new LeaseNotifier(config, store)

  val controller = new MediaLeaseController(auth, store, config, notifications, controllerComponents)
  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
