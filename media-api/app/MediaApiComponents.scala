
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.play.GridComponents
import controllers._
import lib._
import lib.elasticsearch.{ElasticSearch, SearchFilters}
import play.api.ApplicationLoader.Context
import router.Routes

class MediaApiComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new MediaApiConfig()

  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val notifications = new Notifications(config)
  val searchFilters = new SearchFilters(config)
  val mediaApiMetrics = new MediaApiMetrics(config)

  val elasticSearch = new ElasticSearch(config, searchFilters, mediaApiMetrics)
  elasticSearch.ensureAliasAssigned()

  val s3Client = new S3Client(config)

  val usageQuota = new UsageQuota(config, elasticSearch, actorSystem.scheduler)
  usageQuota.scheduleUpdates()

  val imageResponse = new ImageResponse(config, s3Client, usageQuota)

  val mediaApi = new MediaApi(auth, notifications, elasticSearch, imageResponse, config, controllerComponents, s3Client, mediaApiMetrics)
  val suggestionController = new SuggestionController(auth, elasticSearch, controllerComponents)
  val aggController = new AggregationController(auth, elasticSearch, controllerComponents)
  val usageController = new UsageController(auth, config, notifications, elasticSearch, usageQuota, controllerComponents)
  val healthcheckController = new HealthCheck(controllerComponents)

  override val router = new Routes(httpErrorHandler, mediaApi, suggestionController, aggController, usageController, healthcheckController, management)
}
