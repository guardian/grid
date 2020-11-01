import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import com.gu.mediaservice.lib.config.{MetadataStore, UsageRightsStore}
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.management.{ElasticSearchHealthCheck, ManagementWithPermissions}
import com.gu.mediaservice.lib.play.GridComponents
import controllers._
import lib._
import lib.elasticsearch.ElasticSearch
import lib.usagerights.CostCalculator
import play.api.ApplicationLoader.Context
import router.Routes

class MediaApiComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new MediaApiConfig(configuration)

  final override val buildInfo = utils.buildinfo.BuildInfo

  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val messageSender = new ThrallMessageSender(config.thrallKinesisStreamConfig)
  val mediaApiMetrics = new MediaApiMetrics(config)

  val es6Config: ElasticSearchConfig = ElasticSearchConfig(
    alias = config.imagesAlias,
    url = config.elasticsearch6Url,
    cluster = config.elasticsearch6Cluster,
    shards = config.elasticsearch6Shards,
    replicas = config.elasticsearch6Replicas
  )

  val s3Client = new S3Client(config)

  val usageQuota = new UsageQuota(config, actorSystem.scheduler)
  usageQuota.quotaStore.update()
  usageQuota.scheduleUpdates()

  val usageRightsConfigStore = UsageRightsStore(config.configBucket, config)
  usageRightsConfigStore.scheduleUpdates(actorSystem.scheduler)

  val elasticSearch = new ElasticSearch(config, mediaApiMetrics, es6Config, () => usageQuota.usageStore.overQuotaAgencies, () => usageRightsConfigStore.get)
  elasticSearch.ensureAliasAssigned()

  val imageResponse = new ImageResponse(config, s3Client, new CostCalculator(usageRightsConfigStore, usageQuota))

  val metaDataConfigStore = MetadataStore(config.configBucket, config)
  metaDataConfigStore.scheduleUpdates(actorSystem.scheduler)

  val mediaApi = new MediaApi(auth, messageSender, elasticSearch, imageResponse, config, controllerComponents, s3Client, mediaApiMetrics, wsClient,metaDataConfigStore, usageRightsConfigStore)

  val suggestionController = new SuggestionController(auth, elasticSearch, controllerComponents)
  val aggController = new AggregationController(auth, elasticSearch, controllerComponents)
  val usageController = new UsageController(auth, config, elasticSearch, usageQuota, controllerComponents)
  val elasticSearchHealthCheck = new ElasticSearchHealthCheck(controllerComponents, elasticSearch)
  val healthcheckController = new ManagementWithPermissions(controllerComponents, mediaApi, buildInfo)

  override val router = new Routes(httpErrorHandler, mediaApi, suggestionController, aggController, usageController, elasticSearchHealthCheck, healthcheckController)
}
