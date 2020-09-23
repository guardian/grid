import com.gu.mediaservice.lib.config.MetadataStore
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.play.GridComponents
import controllers.ImageLoaderController
import lib._
import lib.storage.ImageLoaderStore
import model.{Uploader, Projector}
import play.api.ApplicationLoader.Context
import router.Routes

class ImageLoaderComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new ImageLoaderConfig(configuration)

  final override val buildInfo = utils.buildinfo.BuildInfo

  val loaderStore = new ImageLoaderStore(config)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val notifications = new Notifications(config)
  val downloader = new Downloader()
<<<<<<< HEAD
  val uploader = new Uploader(loaderStore, config, imageOperations, notifications)

  val projector = Projector(config, imageOperations)

=======
  val optimisedPngOps = new OptimisedPngOps(loaderStore, config)

  val metaDataConfigStore = MetadataStore(config.configBucket, config)
  metaDataConfigStore.scheduleUpdates(actorSystem.scheduler)

  val imageUploadOps = new ImageUploadOps(metaDataConfigStore, loaderStore, config, imageOperations, optimisedPngOps)

  val controller = new ImageLoaderController(auth, downloader, loaderStore, notifications, config, imageUploadOps, controllerComponents, wsClient)
>>>>>>> cbc242eb5... Extract hardcoded values in MetadataConfig into an s3 file that gets loaded into a store

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
