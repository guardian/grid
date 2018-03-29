import com.gu.mediaservice.lib.management.Management
import com.gu.mediaservice.lib.play.{GridComponents, RequestLoggingFilter}
import controllers.{CollectionsController, ImageCollectionsController}
import lib.{CollectionsConfig, CollectionsMetrics, LogConfig, Notifications}
import play.api.{Application, ApplicationLoader}
import play.api.ApplicationLoader.Context
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSComponents
import play.filters.gzip.GzipFilterComponents
import router.Routes
import store.CollectionsStore

class CollectionsComponents(context: Context) extends GridComponents(context)
  with HttpFiltersComponents
  with CORSComponents
  with GzipFilterComponents {

  final override lazy val config = new CollectionsConfig(configuration)
  final override lazy val corsPathPrefixes = config.corsAllAllowedOrigins

  val store = new CollectionsStore(config)
  val metrics = new CollectionsMetrics(config)
  val notifications = new Notifications(config)

  val collections = new CollectionsController(auth, config, store, controllerComponents)
  val imageCollections = new ImageCollectionsController(auth, config, notifications, controllerComponents)
  val management = new Management(controllerComponents)

  keyStore.scheduleUpdates(actorSystem.scheduler)

  // TODO MRB: how to abstract this out to common?
  final override def httpFilters: Seq[EssentialFilter] = super.httpFilters ++ Seq(
    corsFilter, new RequestLoggingFilter(materializer), gzipFilter
  )

  override val router = new Routes(httpErrorHandler, collections, imageCollections, management)
}
