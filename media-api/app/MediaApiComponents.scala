import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.play.{GridComponents, RequestLoggingFilter}
import controllers._
import lib.elasticsearch.{ElasticSearch, SearchFilters}
import lib._
import play.api.ApplicationLoader.Context
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSComponents
import play.filters.gzip.GzipFilterComponents
import router.Routes

class MediaApiComponents(context: Context) extends GridComponents(context)
  with HttpFiltersComponents
  with CORSComponents
  with GzipFilterComponents {

  final override lazy val config = new MediaApiConfig(configuration)

  val imageOperations = new ImageOperations(application.path.getAbsolutePath)

  val notifications = new Notifications(config)
  val searchFilters = new SearchFilters(config)
  val mediaApiMetrics = new MediaApiMetrics(config)
  val elasticSearch = new ElasticSearch(config, searchFilters, mediaApiMetrics)
  val s3Client = new S3Client(config)
  val usageQuota = new UsageQuota(config, elasticSearch)
  val imageResponse = new ImageResponse(config, s3Client, usageQuota)

  val mediaApi = new MediaApi(auth, config, notifications, elasticSearch, imageResponse, controllerComponents)
  val suggestionController = new SuggestionController(auth, elasticSearch, controllerComponents)
  val aggController = new AggregationController(auth, elasticSearch, controllerComponents)
  val usageController = new UsageController(auth, config, notifications, elasticSearch, usageQuota, controllerComponents)
  val healthcheckController = new HealthCheck(auth, elasticSearch, controllerComponents)

  // TODO MRB: how to abstract this out to common?
  final override def httpFilters: Seq[EssentialFilter] = super.httpFilters ++ Seq(
    corsFilter, new RequestLoggingFilter(materializer), gzipFilter
  )

  override lazy val router = new Routes(httpErrorHandler, mediaApi, suggestionController, aggController, usageController, healthcheckController, management)
}
