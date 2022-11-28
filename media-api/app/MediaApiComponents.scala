import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.management.{ElasticSearchHealthCheck, InnerServiceStatusCheckController, Management}
import com.gu.mediaservice.lib.play.GridComponents
import controllers._
import lib._
import lib.elasticsearch.ElasticSearch
import lib.usagerights.CostCalculator
import play.api.ApplicationLoader.Context
import router.Routes

import scala.concurrent.Future

class MediaApiComponents(context: Context) extends GridComponents(context, new MediaApiConfig(_)) {
  final override val buildInfo = utils.buildinfo.BuildInfo

  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val messageSender = new ThrallMessageSender(config.thrallKinesisStreamConfig)
  val mediaApiMetrics = new MediaApiMetrics(config)

  val s3Client = new S3Client(config)

  val usageQuota = new UsageQuota(config, actorSystem.scheduler)
  usageQuota.quotaStore.update()
  usageQuota.scheduleUpdates()
  applicationLifecycle.addStopHook(() => Future{usageQuota.stopUpdates()})

  val elasticSearch = new ElasticSearch(config, mediaApiMetrics, config.esConfig, () => usageQuota.usageStore.overQuotaAgencies, actorSystem.scheduler)
  elasticSearch.ensureIndexExistsAndAliasAssigned()

  val tenantCostCalculators: Map[String, CostCalculator] = config.tenants.map { case (tenantId, tenant) =>
    (tenantId, new CostCalculator(tenant.freeSuppliers, tenant.suppliersCollectionExcl, usageQuota, Some(tenantId)))
  }

  val defaultCostCalculator: CostCalculator = new CostCalculator(
    config.usageRightsConfig.freeSuppliers,
    config.usageRightsConfig.suppliersCollectionExcl,
    usageQuota
  )

  val costCalculatorForTenant: Option[String] => CostCalculator =
    _.flatMap(tenantCostCalculators.get).getOrElse(defaultCostCalculator)

  val imageResponse = new ImageResponse(config, s3Client, costCalculatorForTenant)

  val imageStatusTable = new SoftDeletedMetadataTable(config)

  val mediaApi = new MediaApi(auth, messageSender, imageStatusTable, elasticSearch, imageResponse, config, controllerComponents, s3Client, mediaApiMetrics, wsClient, authorisation, costCalculatorForTenant)
  val suggestionController = new SuggestionController(auth, elasticSearch, controllerComponents)
  val aggController = new AggregationController(auth, elasticSearch, controllerComponents)
  val usageController = new UsageController(auth, config, elasticSearch, usageQuota, controllerComponents)
  val elasticSearchHealthCheck = new ElasticSearchHealthCheck(controllerComponents, elasticSearch)
  val healthcheckController = new Management(controllerComponents, buildInfo)
  val InnerServiceStatusCheckController = new InnerServiceStatusCheckController(auth, controllerComponents, config.services, wsClient)

  override val router = new Routes(
    httpErrorHandler,
    mediaApi,
    suggestionController,
    aggController,
    usageController,
    elasticSearchHealthCheck,
    healthcheckController,
    InnerServiceStatusCheckController
  )
}
