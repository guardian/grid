import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.lib.play.GridComponents
import controllers.ImageLoaderController
import lib._
import lib.storage.ImageLoaderStore
import model.{Projector, Uploader}
import play.api.ApplicationLoader.Context
import router.Routes

class ImageLoaderComponents(context: Context) extends GridComponents(context, new ImageLoaderConfig(_)) with GridLogging {
  final override val buildInfo = utils.buildinfo.BuildInfo

  logger.info(s"Loaded ${config.imageProcessor.processors.size} image processors:")
  config.imageProcessor.processors.zipWithIndex.foreach { case (processor, index) =>
    logger.info(s" $index -> ${processor.description}")
  }

  val store = new ImageLoaderStore(config)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val notifications = new Notifications(config)
  val downloader = new Downloader()
  val uploader = new Uploader(store, config, imageOperations, notifications)

  val projector = Projector(config, imageOperations)

  val controller = new ImageLoaderController(
    auth, downloader, store, notifications, config, uploader, projector, controllerComponents, wsClient)

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
