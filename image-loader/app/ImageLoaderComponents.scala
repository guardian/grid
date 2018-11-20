
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.play.GridComponents
import controllers.ImageLoaderController
import lib._
import lib.storage.ImageLoaderStore
import model.{ImageUploadOps, OptimisedPngOps}
import play.api.ApplicationLoader.Context
import router.Routes

class ImageLoaderComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new ImageLoaderConfig()

  val store = new ImageLoaderStore(config)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val notifications = new Notifications(config)
  val downloader = new Downloader()
  val optimisedPngOps = new OptimisedPngOps(store, config)
  val imageUploadOps = new ImageUploadOps(store, config, imageOperations, optimisedPngOps)

  val controller = new ImageLoaderController(auth, downloader, store, notifications, config, imageUploadOps, controllerComponents, wsClient)

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
