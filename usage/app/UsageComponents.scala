import com.gu.mediaservice.lib.play.{GridComponents, RequestLoggingFilter}
import controllers.UsageApi
import lib._
import model._
import play.api.ApplicationLoader.Context
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSComponents
import play.filters.gzip.GzipFilterComponents
import router.Routes

class UsageComponents(context: Context) extends GridComponents(context)
  with HttpFiltersComponents
  with CORSComponents
  with GzipFilterComponents {

  final override lazy val config = new UsageConfig(configuration)

  val usageMetadataBuilder = new UsageMetadataBuilder(config)
  val mediaWrapper = new MediaWrapperOps(usageMetadataBuilder)
  val mediaUsage = new MediaUsageOps(usageMetadataBuilder)
  val liveContentApi = new LiveContentApi(config)
  val usageGroup = new UsageGroupOps(config, mediaUsage, liveContentApi, mediaWrapper)
  val usageTable = new UsageTable(config, mediaUsage)
  val usageMetrics = new UsageMetrics(config)
  val usageNotifier = new UsageNotifier(config, usageTable)
  val usageStream = new UsageStream(usageGroup)
  val usageRecorder = new UsageRecorder(usageMetrics, usageTable, usageStream, usageNotifier, usageNotifier)
  val notifications = new Notifications(config)

  val controller = new UsageApi(auth, usageTable, usageGroup, notifications, config, usageRecorder, liveContentApi, controllerComponents, playBodyParsers)

  // TODO MRB: how to abstract this out to common?
  final override def httpFilters: Seq[EssentialFilter] = super.httpFilters ++ Seq(
    corsFilter, new RequestLoggingFilter(materializer), gzipFilter
  )

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
