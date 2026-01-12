import com.gu.mediaservice.lib.aws.{Bedrock, Embedder, S3Vectors, SimpleSqsMessageConsumer, ThrallMessageSender}
import com.gu.mediaservice.lib.management.{ElasticSearchHealthCheck, InnerServiceStatusCheckController, Management}
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
  elasticSearch.ensureIndexExistsAndAliasAssigned()

  val imageResponse = new ImageResponse(config, s3Client, usageQuota)

  val softDeletedMetadataTable = new SoftDeletedMetadataTable(config)
  val embedder = new Embedder(new S3Vectors(config), new Bedrock(config), new SimpleSqsMessageConsumer("https://sqs.eu-west-1.amazonaws.com/563563610310/image-embedder-TEST", config))

  val mediaApi = new MediaApi(auth, messageSender, softDeletedMetadataTable, elasticSearch, imageResponse, config, controllerComponents, s3Client, mediaApiMetrics, wsClient, authorisation, embedder)
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
