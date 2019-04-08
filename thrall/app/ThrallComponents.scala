import com.amazonaws.services.cloudwatch.AmazonCloudWatchClientBuilder
import com.amazonaws.services.kinesis.AmazonKinesisClientBuilder
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.sns.AmazonSNSClientBuilder
import com.amazonaws.services.sqs.AmazonSQSClientBuilder
import com.gu.mediaservice.lib.aws.Kinesis
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import com.gu.mediaservice.lib.elasticsearch6.ElasticSearch6Config
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{HealthCheck, ThrallController}
import lib._
import org.joda.time.format.ISODateTimeFormat
import play.api.ApplicationLoader.Context
import play.api.Logger
import router.Routes

class ThrallComponents(context: Context) extends GridComponents("thrall", context) {
  val s3Client = AmazonS3ClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val sqsClient = AmazonSQSClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val snsClient = AmazonSNSClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val kinesisClient = AmazonKinesisClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val cloudwatchClient = AmazonCloudWatchClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()

  val imageBucket = config.get[String]("s3.image.bucket")
  val thumbBucket = config.get[String]("s3.thumb.bucket")

  val thrallTopicArn = config.get[String]("sns.topic.arn")
  val thrallKinesisStreamName = config.get[String]("thrall.kinesis.stream")
  val metadataTopicArn = config.get[String]("indexed.image.sns.topic.arn")
  val cloudwatchNamespace = config.get[String]("cloudwatch.metrics.namespace")

  val healthyMessageRate = config.get[Int]("sqs.message.min.frequency")
  val thrallFrom = config.getOptional[String]("thrall.from").map(ISODateTimeFormat.dateTime.parseDateTime)

  val store = new ThrallStore(imageBucket, thumbBucket, s3Client)
  val dynamoNotifications = new MetadataNotifications(metadataTopicArn, snsClient)
  val thrallMetrics = new ThrallMetrics(cloudwatchNamespace, cloudwatchClient)

  val es1Config: Option[ElasticSearchConfig] = for {
    p <- config.getOptional[Int]("es.port")
    c <- config.getOptional[String]("es.cluster")
  } yield {
    ElasticSearchConfig(alias = config.get[String]("es.index.aliases.write"),
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
      alias = config.get[String]("es.index.aliases.write"),
      host = h,
      port = p,
      cluster = c,
      shards = s,
      replicas = r
    )
  }

  val es1Opt = es1Config.map { c =>
    Logger.info("Configuring ES1: " + c)
    val es1 = new ElasticSearch(c, Some(thrallMetrics))
    es1.ensureAliasAssigned()
    es1
  }

  val es6pot = es6Config.map { c =>
    Logger.info("Configuring ES6: " + c)
    val es6 = new ElasticSearch6(c, Some(thrallMetrics))
    es6.ensureAliasAssigned()
    es6
  }

  val messageConsumerForHealthCheck = es1Opt.map { es1 =>
    val kinesis = new Kinesis(kinesisClient, thrallKinesisStreamName)
    val thrallMessageConsumer = new ThrallMessageConsumer(thrallTopicArn, sqsClient, kinesis, es1, thrallMetrics, store, dynamoNotifications, new SyndicationRightsOps(es1))

    thrallMessageConsumer.startSchedule()
    context.lifecycle.addStopHook {
      () => thrallMessageConsumer.actorSystem.terminate()
    }
    thrallMessageConsumer
  }.get

  es6pot.map { es6 =>
    val thrallKinesisMessageConsumer = new kinesis.ThrallMessageConsumer(thrallKinesisStreamName, awsCredentials, region, es6, thrallMetrics,
      store, dynamoNotifications, new SyndicationRightsOps(es6), thrallFrom)
    thrallKinesisMessageConsumer.start()
  }

  val thrallController = new ThrallController(controllerComponents)
  val healthCheckController = new HealthCheck(es1Opt.get, messageConsumerForHealthCheck, healthyMessageRate, controllerComponents)

  override lazy val router = new Routes(httpErrorHandler, thrallController, healthCheckController, management)
}
