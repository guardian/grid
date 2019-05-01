import com.gu.mediaservice.lib.aws.MessageSender
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import com.gu.mediaservice.lib.elasticsearch6.ElasticSearch6Config
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.management.ManagementWithPermissions
import com.gu.mediaservice.lib.play.GridComponents
import controllers._
import lib._
import lib.elasticsearch.ElasticSearchVersion
import play.api.ApplicationLoader.Context
import play.api.Logger
import router.Routes

class MediaApiComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new MediaApiConfig(configuration)

  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val messageSender = new MessageSender(config, config.topicArn)
  val mediaApiMetrics = new MediaApiMetrics(config)

  val es1Config: Option[ElasticSearchConfig] = for {
    p <- config.elasticsearchPort
    c <- config.elasticsearchCluster
  } yield {
    ElasticSearchConfig(alias = config.imagesAlias,
      host = config.elasticsearchHost,
      port = p,
      cluster = c
    )
  }

  val es6Config: Option[ElasticSearch6Config] = for {
    u <- config.elasticsearch6Url
    c <- config.elasticsearch6Cluster
    s <- config.elasticsearch6Shards
    r <- config.elasticsearch6Replicas
  } yield {
    ElasticSearch6Config(
      alias = config.imagesAlias,
      url = u,
      cluster = c,
      shards = s,
      replicas = r
    )
  }

  val elasticSearches = Seq(
    es1Config.map { c =>
      Logger.info("Configuring ES1: " + c)
      val es1 = new lib.elasticsearch.impls.elasticsearch1.ElasticSearch(config, mediaApiMetrics, c)
      es1.ensureAliasAssigned()
      es1
    },
    es6Config.map { c =>
      Logger.info("Configuring ES6: " + c)
      val es6 = new lib.elasticsearch.impls.elasticsearch6.ElasticSearch(config, mediaApiMetrics, c)
      es6.ensureAliasAssigned()
      es6
    }
  ).flatten

  val elasticSearch: ElasticSearchVersion = new lib.elasticsearch.TogglingElasticSearch(elasticSearches.head, elasticSearches.last)
  elasticSearch.ensureAliasAssigned()

  val s3Client = new S3Client(config)

  val usageQuota = new UsageQuota(config, elasticSearch, actorSystem.scheduler)
  usageQuota.scheduleUpdates()

  val imageResponse = new ImageResponse(config, s3Client, usageQuota)

  val mediaApi = new MediaApi(auth, messageSender, elasticSearch, imageResponse, config, controllerComponents, s3Client, mediaApiMetrics)
  val suggestionController = new SuggestionController(auth, elasticSearch, controllerComponents)
  val aggController = new AggregationController(auth, elasticSearch, controllerComponents)
  val usageController = new UsageController(auth, config, elasticSearch, usageQuota, controllerComponents)
  val healthcheckController = new ManagementWithPermissions(controllerComponents, mediaApi)

  override val router = new Routes(httpErrorHandler, mediaApi, suggestionController, aggController, usageController, healthcheckController)
}
