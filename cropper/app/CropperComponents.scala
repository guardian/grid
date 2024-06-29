import com.gu.mediaservice.lib.imaging.{MagickImageOperations, VipsImageOperations}
import com.gu.mediaservice.lib.management.{InnerServiceStatusCheckController, Management}
import com.gu.mediaservice.lib.play.GridComponents
import controllers.CropperController
import lib.{CropStore, CropperConfig, Crops, Notifications}
import play.api.ApplicationLoader.Context
import router.Routes

class CropperComponents(context: Context) extends GridComponents(context, new CropperConfig(_)) {
  final override val buildInfo = utils.buildinfo.BuildInfo

  val store = new CropStore(config)
  val imageOperations = new MagickImageOperations(context.environment.rootPath.getAbsolutePath)
  val vipsImageOperations = new VipsImageOperations(context.environment.rootPath.getAbsolutePath)

  val crops = new Crops(config, store, imageOperations, vipsImageOperations)
  val notifications = new Notifications(config)

  val controller = new CropperController(auth, crops, store, notifications, config, controllerComponents, wsClient, authorisation)
  val permissionsAwareManagement = new Management(controllerComponents, buildInfo)
  val InnerServiceStatusCheckController = new InnerServiceStatusCheckController(auth, controllerComponents, config.services, wsClient)


  override lazy val router = new Routes(httpErrorHandler, controller, permissionsAwareManagement, InnerServiceStatusCheckController)
}
