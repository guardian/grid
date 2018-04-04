import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.play.{GridComponents, RequestLoggingFilter}
import controllers.ImageLoaderController
import lib._
import lib.storage.ImageLoaderStore
import model.{ImageUploadOps, OptimisedPngOps}
import play.api.ApplicationLoader.Context
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSComponents
import play.filters.gzip.GzipFilterComponents
import router.Routes

class ImageLoaderComponents(context: Context) extends GridComponents(context)
  with HttpFiltersComponents
  with CORSComponents
  with GzipFilterComponents {

  final override lazy val config = new ImageLoaderConfig(configuration)

  val store = new ImageLoaderStore(config)
  val imageOperations = new ImageOperations(application.path.getAbsolutePath)

  val notifications = new Notifications(config)
  val downloader = new Downloader(wsClient, materializer)
  val optimisedPngOps = new OptimisedPngOps(store, config)
  val imageUploadOps = new ImageUploadOps(store, config, imageOperations, optimisedPngOps)

  val controller = new ImageLoaderController(auth, downloader, store, notifications, config, imageUploadOps, controllerComponents, wsClient)

  // TODO MRB: how to abstract this out to common?
  final override def httpFilters: Seq[EssentialFilter] = super.httpFilters ++ Seq(
    corsFilter, new RequestLoggingFilter(materializer), gzipFilter
  )

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
