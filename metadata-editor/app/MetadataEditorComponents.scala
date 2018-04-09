import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.play.{GridComponents, RequestLoggingFilter}
import controllers.{EditsApi, EditsController}
import lib._
import play.api.ApplicationLoader.Context
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSComponents
import play.filters.gzip.GzipFilterComponents
import router.Routes

class MetadataEditorComponents(context: Context) extends GridComponents(context)
  with HttpFiltersComponents
  with CORSComponents
  with GzipFilterComponents {

  final override lazy val config = new EditsConfig(configuration)

  val store = new EditsStore(config)
  val notifications = new Notifications(config)
  val imageOperations = new ImageOperations(application.path.getAbsolutePath)

  val editsController = new EditsController(auth, store, notifications, config, controllerComponents)
  val controller = new EditsApi(auth, config, controllerComponents)

  // TODO MRB: how to abstract this out to common?
  final override def httpFilters: Seq[EssentialFilter] = super.httpFilters ++ Seq(
    corsFilter, new RequestLoggingFilter(materializer), gzipFilter
  )

  override lazy val router = new Routes(httpErrorHandler, controller, editsController, management)
}
