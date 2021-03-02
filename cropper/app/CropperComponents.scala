import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.management.Management
import com.gu.mediaservice.lib.play.GridComponents
import controllers.CropperController
import lib.{CropStore, CropperConfig, Crops, Notifications}
import play.api.ApplicationLoader.Context
import router.Routes

class CropperComponents(context: Context) extends GridComponents(context, new CropperConfig(_)) {
  final override val buildInfo = utils.buildinfo.BuildInfo

  val store = new CropStore(config)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val crops = new Crops(config, store, imageOperations)
  val notifications = new Notifications(config)

  val controller = new CropperController(auth, crops, store, notifications, config, controllerComponents, wsClient, authorisation)
  val permissionsAwareManagement = new Management(controllerComponents, buildInfo)

  override lazy val router = new Routes(httpErrorHandler, controller, permissionsAwareManagement)
}
