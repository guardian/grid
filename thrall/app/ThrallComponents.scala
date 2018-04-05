import com.gu.mediaservice.lib.play.{GridComponents, RequestLoggingFilter}
import controllers.{HealthCheck, ThrallController}
import lib._
import play.api.ApplicationLoader.Context
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSComponents
import play.filters.gzip.GzipFilterComponents
import router.Routes

class ThrallComponents(context: Context) extends GridComponents(context)
  with HttpFiltersComponents
  with CORSComponents
  with GzipFilterComponents {

  final override lazy val config = new ThrallConfig(configuration)

  val store = new ThrallStore(config)
  val notifications = new DynamoNotifications(config)
  val thrallMetrics = new ThrallMetrics(config)
  val es = new ElasticSearch(config, thrallMetrics)
  val thrallMessageConsumer = new ThrallMessageConsumer(config, es, thrallMetrics, store, notifications)

  val thrallController = new ThrallController(controllerComponents)
  val healthCheckController = new HealthCheck(auth, es, thrallMessageConsumer, config, controllerComponents)

  // TODO MRB: how to abstract this out to common?
  final override def httpFilters: Seq[EssentialFilter] = super.httpFilters ++ Seq(
    corsFilter, new RequestLoggingFilter(materializer), gzipFilter
  )

  override lazy val router = new Routes(httpErrorHandler, thrallController, healthCheckController, management)
}
