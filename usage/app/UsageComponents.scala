import com.amazonaws.services.cloudwatch.AmazonCloudWatchClientBuilder
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBAsyncClientBuilder
import com.amazonaws.services.kinesis.AmazonKinesisClientBuilder
import com.amazonaws.services.sns.AmazonSNSClientBuilder
import com.gu.mediaservice.lib.aws.{Kinesis, MessageSender, SNS}
import com.gu.mediaservice.lib.play.{GridCORSAuthentication, GridComponents}
import controllers.UsageApi
import lib._
import model._
import play.api.ApplicationLoader.Context
import router.Routes

import scala.concurrent.Future

class UsageComponents(context: Context) extends GridComponents("usage", context) with GridCORSAuthentication {
  val dynamoClient = AmazonDynamoDBAsyncClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val cloudwatchClient = AmazonCloudWatchClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val snsClient = AmazonSNSClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()
  val kinesisClient = AmazonKinesisClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()

  val usageConfig = new UsageConfig(config)

  val usageMetadataBuilder = new UsageMetadataBuilder(usageConfig.composerContentBaseUrl)
  val mediaWrapper = new MediaWrapperOps(usageMetadataBuilder)
  val mediaUsage = new MediaUsageOps(usageMetadataBuilder)
  val liveContentApi = new LiveContentApi(usageConfig.capiLiveUrl, usageConfig.capiApiKey)
  val usageGroup = new UsageGroupOps(services, usageConfig.usageDateLimit, mediaUsage, liveContentApi, mediaWrapper)
  val usageTable = new UsageTable(usageConfig.usageRecordTable, mediaUsage, dynamoClient)
  val usageMetrics = new UsageMetrics(usageConfig.cloudwatchMetricsNamespace, cloudwatchClient)

  val sns = new SNS(snsClient, usageConfig.snsTopicArn)
  val kinesis = new Kinesis(kinesisClient, usageConfig.thrallKinesisStream)
  val messageSender = new MessageSender(sns, kinesis)

  val usageNotifier = new UsageNotifier(usageTable, messageSender)
  val usageStream = new UsageStream(usageGroup)
  val usageRecorder = new UsageRecorder(usageMetrics, usageTable, usageStream, usageNotifier, usageNotifier)

  if(!usageConfig.apiOnly) {
    val crierReader = new CrierStreamReader(region, usageConfig.liveKinesisReaderConfig, usageConfig.previewKinesisReaderConfig, liveContentApi)
    crierReader.start()
  }

  usageRecorder.start()
  context.lifecycle.addStopHook(() => {
    usageRecorder.stop()
    Future.successful(())
  })

  val controller = new UsageApi(auth, services, usageTable, usageGroup, messageSender, usageRecorder, liveContentApi, usageConfig.maxPrintRequestLengthInKb, controllerComponents, playBodyParsers)

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
