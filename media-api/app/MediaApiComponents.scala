import com.amazonaws.services.cloudwatch.AmazonCloudWatchClientBuilder
import com.amazonaws.services.kinesis.AmazonKinesisClientBuilder
import com.amazonaws.services.sns.AmazonSNSClientBuilder
import com.gu.mediaservice.lib.auth.PermissionsHandler
import com.gu.mediaservice.lib.aws.{Kinesis, MessageSender, SNS}
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import lib.elasticsearch.impls.elasticsearch1.{ElasticSearchFactory => Elasticsearch1Factory}
import lib.elasticsearch.impls.elasticsearch6.{ElasticSearchFactory => Elasticsearch6Factory}
import com.gu.mediaservice.lib.elasticsearch6.ElasticSearch6Config
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.management.ManagementWithPermissions
import com.gu.mediaservice.lib.play.{GridCORSAuthentication, GridComponents}
import com.typesafe.config.ConfigException
import controllers._
import lib._
import lib.elasticsearch.ElasticSearchVersion
import org.joda.time.DateTime
import play.api.ApplicationLoader.Context
import play.api.Logger
import router.Routes

import scala.collection.JavaConverters._
import scala.util.Try

class MediaApiComponents(context: Context) extends GridComponents(context) with GridCORSAuthentication {
  val snsClient = AmazonSNSClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val kinesisClient = AmazonKinesisClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val cloudwatchClient = AmazonCloudWatchClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()

  val snsTopicArn = config.get[String]("sns.topic.arn")
  val thrallKinesisStream = config.get[String]("thrall.kinesis.stream")
  val cloudwatchMetricsNamespace = config.get[String]("cloudwatch.metrics.namespace")

  val imageBucket = config.get[String]("s3.image.bucket")
  val thumbBucket = config.get[String]("s3.thumb.bucket")

  val cloudFrontDomainThumbBucket = config.getOptional[String]("cloudfront.domain.thumbbucket")
  val cloudFrontKeyPairId = config.getOptional[String]("cloudfront.keypair.id")
  val cloudFrontPrivateKeyLocation = "/etc/gu/ssl/private/cloudfront.pem"

  val configBucket = config.get[String]("s3.config.bucket")
  val usageMailBucket = config.get[String]("s3.usagemail.bucket")
  val quotaStoreKey = config.get[String]("quota.store.key")

  val persistenceCollections = Try(Some(config.underlying.getStringList("persistence.collections").asScala.toList)).recover { case _: ConfigException.Missing => None }.get
  val persistenceIdentifier = config.get[String]("persistence.identifier")
  val syndicationStartDate = config.getOptional[String]("syndication.start").map(d => DateTime.parse(d).withTimeAtStartOfDay())

  val permissionStage = config.get[String]("permissions.stage")

  val requiredMetadata = List("credit", "description", "usageRights")

  val sns = new SNS(snsClient, snsTopicArn)
  val kinesis = new Kinesis(kinesisClient, thrallKinesisStream)
  val messageSender = new MessageSender(sns, kinesis)

  val permissionsHandler = new PermissionsHandler(permissionStage, region, awsCredentials)
  val mediaApiMetrics = new MediaApiMetrics(cloudwatchMetricsNamespace, cloudwatchClient)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val es1Config: Option[ElasticSearchConfig] = for {
    p <- config.getOptional[Int]("es.port")
    c <- config.getOptional[String]("es.cluster")
  } yield {
    ElasticSearchConfig(alias = config.get[String]("es.index.aliases.read"),
      host = config.get[String]("es.host"),
      port = p,
      cluster = c
    )
  }

  val es6Config: Option[ElasticSearch6Config] = for {
    h <- config.getOptional[String]("es6.host")
    p <- config.getOptional[Int]("es6.port")
    c <- config.getOptional[String]("es6.cluster")
    s <- config.getOptional[Int]("es6.shards")
    r <- config.getOptional[Int]("es6.replicas")
  } yield {
    ElasticSearch6Config(
      alias = config.get[String]("es.index.aliases.read"),
      host = h,
      port = p,
      cluster = c,
      shards = s,
      replicas = r
    )
  }

  val elasticSearches = Seq(
    es1Config.map { c =>
      Logger.info("Configuring ES1: " + c)
      Elasticsearch1Factory.build(c, Some(mediaApiMetrics), persistenceIdentifier, syndicationStartDate, requiredMetadata, persistenceCollections)
    },
    es6Config.map { c =>
      Logger.info("Configuring ES6: " + c)
      Elasticsearch6Factory.build(c, Some(mediaApiMetrics), persistenceIdentifier, syndicationStartDate, requiredMetadata, persistenceCollections)
    }
  ).flatten

  val elasticSearch: ElasticSearchVersion = new lib.elasticsearch.TogglingElasticSearch(elasticSearches.head, elasticSearches.last)
  elasticSearch.ensureAliasAssigned()

  val cloudFrontS3Client = new S3Client(cloudFrontPrivateKeyLocation, cloudFrontKeyPairId, s3Client)

  val quotaStore = new QuotaStore(quotaStoreKey, configBucket, s3Client)
  val usageStore = new UsageStore(usageMailBucket, s3Client, quotaStore)

  val usageQuota = new UsageQuota(quotaStore, usageStore, elasticSearch, actorSystem.scheduler)
  usageQuota.scheduleUpdates()

  val imageResponse = new ImageResponse(services, imageBucket, thumbBucket, cloudFrontDomainThumbBucket, persistenceIdentifier, persistenceCollections.getOrElse(List.empty), cloudFrontS3Client, usageQuota)

  val mediaApi = new MediaApi(auth, services, imageBucket, messageSender, elasticSearch, imageResponse, permissionsHandler, controllerComponents, cloudFrontS3Client, mediaApiMetrics)
  val suggestionController = new SuggestionController(auth, elasticSearch, controllerComponents)
  val aggController = new AggregationController(auth, elasticSearch, controllerComponents)
  val usageController = new UsageController(auth, elasticSearch, usageQuota, controllerComponents)
  val healthcheckController = new ManagementWithPermissions(controllerComponents, permissionsHandler)

  override val router = new Routes(httpErrorHandler, mediaApi, suggestionController, aggController, usageController, healthcheckController)
}
