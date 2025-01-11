import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.management.{ElasticSearchHealthCheck, Management}
import com.gu.mediaservice.lib.metadata.SoftDeletedMetadataTable
import com.gu.mediaservice.lib.play.GridComponents
import controllers._
import lib._
import lib.elasticsearch.ElasticSearch
import play.api.ApplicationLoader.Context
import router.Routes

import scala.concurrent.Future

class MediaApiComponents(context: Context) extends GridComponents(context, new MediaApiConfig(_)) {
  final override val buildInfo = utils.buildinfo.BuildInfo

  val messageSender = new ThrallMessageSender(config.thrallKinesisStreamConfig)
  val mediaApiMetrics = new MediaApiMetrics(config, actorSystem, applicationLifecycle)

  val s3Client = new S3Client(config)

  val usageQuota = new UsageQuota(config, actorSystem.scheduler)
  usageQuota.quotaStore.update()
  usageQuota.scheduleUpdates()
  applicationLifecycle.addStopHook(() => Future{usageQuota.stopUpdates()})

  val elasticSearch = new ElasticSearch(config, mediaApiMetrics, config.esConfig, () => usageQuota.usageStore.overQuotaAgencies, actorSystem.scheduler)
  // TODO needs to move somewhere more instance aware elasticSearch.ensureIndexExistsAndAliasAssigned()

  val imageResponse = new ImageResponse(config, s3Client, usageQuota)

  val softDeletedMetadataTable = new SoftDeletedMetadataTable(config)

  val mediaApi = new MediaApi(auth, messageSender, softDeletedMetadataTable, elasticSearch, imageResponse, config, controllerComponents, s3Client, mediaApiMetrics, wsClient, authorisation, events)
  val suggestionController = new SuggestionController(auth, elasticSearch, controllerComponents)
  val aggController = new AggregationController(auth, elasticSearch, controllerComponents)
  val usageController = new UsageController(auth, config, elasticSearch, usageQuota, controllerComponents)
  val elasticSearchHealthCheck = new ElasticSearchHealthCheck(controllerComponents, elasticSearch)
  val healthcheckController = new Management(controllerComponents, buildInfo)

  override val router = new Routes(
    httpErrorHandler,
    mediaApi,
    suggestionController,
    aggController,
    usageController,
    elasticSearchHealthCheck,
    healthcheckController
  )
}
