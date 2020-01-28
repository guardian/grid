import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.play.GridComponents
import controllers.ImageLoaderController
import lib._
import lib.storage.ImageLoaderStore
import model.{ImageUploadOps, ImageUploadProjector}
import play.api.ApplicationLoader.Context
import router.Routes

class ImageLoaderComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new ImageLoaderConfig(configuration)

  final override val buildInfo = utils.buildinfo.BuildInfo

  val store = new ImageLoaderStore(config)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val notifications = new Notifications(config)
  val downloader = new Downloader()
  val imageUploadOps = new ImageUploadOps(store, config, imageOperations)

  val imageUploadProjector = ImageUploadProjector(config, imageOperations)

  val controller = new ImageLoaderController(auth, downloader, store, notifications, config, imageUploadOps, imageUploadProjector, controllerComponents, wsClient)

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
