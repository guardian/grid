import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.play.{GridComponents, RequestLoggingFilter}
import controllers.CropperController
import lib.{CropStore, CropperConfig, Crops, Notifications}
import play.api.ApplicationLoader.Context
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSComponents
import play.filters.gzip.GzipFilterComponents
import router.Routes

class CropperComponents(context: Context) extends GridComponents(context)
  with HttpFiltersComponents
  with CORSComponents
  with GzipFilterComponents {

  final override lazy val config = new CropperConfig(configuration)

  val store = new CropStore(config)
  val imageOperations = new ImageOperations(application.path.getAbsolutePath)

  val crops = new Crops(config, store, imageOperations)
  val notifications = new Notifications(config)

  val controller = new CropperController(auth, crops, store, notifications, config, controllerComponents)

  // TODO MRB: how to abstract this out to common?
  final override def httpFilters: Seq[EssentialFilter] = super.httpFilters ++ Seq(
    corsFilter, new RequestLoggingFilter(materializer), gzipFilter
  )

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
